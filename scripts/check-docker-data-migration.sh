#!/usr/bin/env bash
# Detect when dev MongoDB bind-mount data is missing/stale but a legacy Docker named volume still holds data.
#
# Exit 0 — bind mount looks OK, or no legacy volume to migrate from.
# Exit 1 — legacy volume likely has your real data; run migrate-legacy-docker-volumes.sh
#
# Optional env:
#   KANBOARD_DOCKER_DATA_DIR — override bind mount root (same as compose)
#   COMPOSE_PROJECT_NAME     — compose project prefix for volume names
#   SKIP_MONGO_LOGICAL_PROBE=1 — size-only checks (faster, less accurate)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_ROOT="$("${SCRIPT_DIR}/ensure-docker-data-dirs.sh")"
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$PROJECT_ROOT")}"
PROBE_SCRIPT="${SCRIPT_DIR}/probe-mongo-data-dir-users.sh"

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

legacy_volume_mountpoint() {
  docker volume inspect "$1" --format '{{.Mountpoint}}' 2>/dev/null || true
}

bind_users_count() {
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'kanboard-mongodb'; then
    docker exec kanboard-mongodb mongosh kanboard --quiet --eval "db.users.countDocuments()" 2>/dev/null | tr -cd '0-9' || echo 0
    return
  fi
  if [ -x "$PROBE_SCRIPT" ]; then
    bash "$PROBE_SCRIPT" "${DATA_ROOT}/mongodb/db" 27019
  else
    echo 0
  fi
}

legacy_users_count() {
  local vol_name="$1"
  if [ -x "$PROBE_SCRIPT" ]; then
    bash "$PROBE_SCRIPT" --volume "$vol_name" 27020
  else
    echo 0
  fi
}

print_resync_instructions() {
  echo ""
  echo "ERROR: MongoDB dev data mismatch"
  echo "  Active compose path (bind mount): ${DATA_ROOT}/mongodb/db  (~$((BIND_BYTES / 1048576)) MiB, ${BIND_USERS} users)"
  echo "  Legacy Docker volume (NOT mounted): ${LEGACY_VOL}  (~$((LEGACY_BYTES / 1048576)) MiB, ${LEGACY_USERS} users)"
  echo ""
  echo "  The bind mount can look large on disk after data was deleted (WiredTiger files remain)."
  echo "  docker-compose.yml only reads the bind mount — not the legacy named volume."
  echo ""
  echo "  Fix (MongoDB must be stopped):"
  echo "    docker compose stop mongodb"
  echo "    ./scripts/migrate-legacy-docker-volumes.sh --replace"
  echo "    docker compose up -d mongodb && docker compose up --no-deps mongodb-init"
  echo ""
  echo "  Prevent recurrence: keep MONGODB_TEST_URI on kanboard_test (never kanboard) when running bun test."
  echo "  See docs/DOCKER-DEV-DATA.md"
  echo ""
}

BIND_BYTES="$(to_int_bytes "$(bind_bytes)")"
[ -z "$BIND_BYTES" ] && BIND_BYTES=0
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

if [ -z "$LEGACY_VOL" ] || [ "${LEGACY_BYTES}" -eq 0 ]; then
  exit 0
fi

# Logical probe: legacy has app data but bind mount was wiped (common after bun test misconfiguration).
if [ "${SKIP_MONGO_LOGICAL_PROBE:-}" != "1" ] && [ "${LEGACY_BYTES}" -gt 1048576 ]; then
  LEGACY_USERS="$(legacy_users_count "$LEGACY_VOL")"
  LEGACY_USERS="$(tr -cd '0-9' <<<"${LEGACY_USERS:-0}")"
  [ -z "$LEGACY_USERS" ] && LEGACY_USERS=0
  if [ "${LEGACY_USERS}" -gt 0 ]; then
    BIND_USERS="$(bind_users_count)"
    BIND_USERS="$(tr -cd '0-9' <<<"${BIND_USERS:-0}")"
    [ -z "$BIND_USERS" ] && BIND_USERS=0
    if [ "${BIND_USERS}" -eq 0 ]; then
      print_resync_instructions
      exit 1
    fi
  fi
fi

# Bind dir empty on disk but legacy exists.
if [ "$BIND_LOOKS_EMPTY" = true ] && [ "${LEGACY_BYTES}" -gt 1048576 ]; then
  echo ""
  echo "WARNING: ${DATA_ROOT}/mongodb/db is nearly empty but Docker volume ${LEGACY_VOL} still exists."
  echo "         Migrate before starting MongoDB:"
  echo "         ./scripts/migrate-legacy-docker-volumes.sh --replace"
  echo ""
  exit 1
fi

# Legacy volume is much larger than bind mount on disk.
if [ "${LEGACY_BYTES}" -gt 104857600 ] && [ "${BIND_BYTES}" -lt $((LEGACY_BYTES / 3)) ]; then
  LEGACY_USERS="${LEGACY_USERS:-0}"
  BIND_USERS="${BIND_USERS:-0}"
  print_resync_instructions
  exit 1
fi

exit 0
