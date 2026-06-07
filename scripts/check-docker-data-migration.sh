#!/usr/bin/env bash
# Detect when dev MongoDB bind-mount data is missing/stale but a legacy Docker named volume still holds data.
#
# Exit 0 — bind mount looks OK, or no legacy volume to migrate from.
# Exit 1 — legacy volume likely has your real data; run migrate-legacy-docker-volumes.sh
#
# Optional env:
#   KANBOARD_DOCKER_DATA_DIR — override bind mount root (same as compose)
#   COMPOSE_PROJECT_NAME     — compose project prefix for volume names

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_ROOT="$("${SCRIPT_DIR}/ensure-docker-data-dirs.sh")"
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$PROJECT_ROOT")}"

# Bytes on disk (probe via container so root-owned journal files are counted).
bind_bytes() {
  docker run --rm \
    -v "${DATA_ROOT}/mongodb/db:/v:ro" \
    alpine:3.20 \
    sh -c 'du -sb /v 2>/dev/null | head -1 | cut -f1' 2>/dev/null || true
}

# Bytes in a Docker named volume (read-only probe container).
legacy_volume_bytes() {
  local vol_name="$1"
  docker run --rm \
    -v "${vol_name}:/v:ro" \
    alpine:3.20 \
    sh -c 'du -sb /v 2>/dev/null | head -1 | cut -f1' 2>/dev/null || true
}

to_int_bytes() {
  tr -cd '0-9' <<<"${1:-}" | head -c 20
}

find_legacy_mongo_volume() {
  for candidate in \
    "${COMPOSE_PROJECT}_mongo-data" \
    "atlboard-new_mongo-data" \
    "kanboard-new_mongo-data" \
    "kanboard_mongo-data"; do
    if docker volume inspect "$candidate" >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

BIND_BYTES="$(to_int_bytes "$(bind_bytes)")"
[ -z "$BIND_BYTES" ] && BIND_BYTES=0
# Fresh empty replica-set Mongo is ~35–45 MiB on disk; migrated dev DB is typically much larger.
BIND_LOOKS_EMPTY=false
if [ "${BIND_BYTES}" -lt 83886080 ]; then
  BIND_LOOKS_EMPTY=true
fi

LEGACY_VOL=""
if LEGACY_VOL="$(find_legacy_mongo_volume)"; then
  LEGACY_BYTES="$(to_int_bytes "$(legacy_volume_bytes "$LEGACY_VOL")")"
else
  LEGACY_BYTES=0
fi
[ -z "$LEGACY_BYTES" ] && LEGACY_BYTES=0

MIGRATION_MARKER="${DATA_ROOT}/mongodb/MIGRATION_SOURCE.txt"
if [ -f "$MIGRATION_MARKER" ] && [ "${BIND_BYTES}" -gt 104857600 ]; then
  exit 0
fi

# No legacy volume — nothing to migrate.
if [ -z "$LEGACY_VOL" ] || [ "${LEGACY_BYTES}" -eq 0 ]; then
  exit 0
fi

# Bind mount already substantial — assume migrated / in use.
if [ "$BIND_LOOKS_EMPTY" = false ] && [ "${BIND_BYTES}" -ge $((LEGACY_BYTES / 2)) ]; then
  exit 0
fi

# Legacy volume is much larger than bind mount — classic split-brain after compose switched to bind mounts.
if [ "${LEGACY_BYTES}" -gt 104857600 ] && [ "${BIND_BYTES}" -lt $((LEGACY_BYTES / 3)) ]; then
  echo ""
  echo "ERROR: MongoDB dev data mismatch"
  echo "  Active compose path (bind mount): ${DATA_ROOT}/mongodb/db  (~$((BIND_BYTES / 1048576)) MiB)"
  echo "  Legacy Docker volume (NOT mounted): ${LEGACY_VOL}  (~$((LEGACY_BYTES / 1048576)) MiB)"
  echo ""
  echo "  docker-compose.yml does NOT use the legacy named volume. It only reads the bind mount."
  echo "  Starting the dev stack now would keep using the smaller/empty database on disk."
  echo ""
  echo "  Fix (MongoDB must be stopped):"
  echo "    docker compose stop mongodb"
  echo "    ./scripts/migrate-legacy-docker-volumes.sh --replace"
  echo "    docker compose up -d mongodb && docker compose up --no-deps mongodb-init"
  echo ""
  echo "  See docs/DOCKER-DEV-DATA.md"
  echo ""
  exit 1
fi

# Bind dir empty but legacy exists (any size).
if [ "$BIND_LOOKS_EMPTY" = true ] && [ "${LEGACY_BYTES}" -gt 1048576 ]; then
  echo ""
  echo "WARNING: ${DATA_ROOT}/mongodb/db is nearly empty but Docker volume ${LEGACY_VOL} still exists."
  echo "         Migrate before starting MongoDB:"
  echo "         ./scripts/migrate-legacy-docker-volumes.sh --replace"
  echo ""
  exit 1
fi

exit 0
