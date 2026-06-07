#!/usr/bin/env bash
# Copy data from legacy Docker named volumes into .docker-data bind mounts.
#
# IMPORTANT: stop MongoDB before replacing db files (docker compose stop mongodb).
# Do NOT cp legacy data into a non-empty .docker-data/mongodb/db — that corrupts WiredTiger.
#
# Usage:
#   ./scripts/migrate-legacy-docker-volumes.sh           # skip dirs that already have files
#   ./scripts/migrate-legacy-docker-volumes.sh --replace # backup existing bind data, then copy

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_ROOT="$("${SCRIPT_DIR}/ensure-docker-data-dirs.sh")"
REPLACE=false

if [[ "${1:-}" == "--replace" ]]; then
  REPLACE=true
fi

COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$PROJECT_ROOT")}"
MONGO_DB_COPIED=false
MONGO_CONFIG_COPIED=false

copy_volume_if_needed() {
  local vol_name="$1"
  local dest_dir="$2"
  local label="$3"
  local kind="${4:-generic}"

  if ! docker volume inspect "$vol_name" >/dev/null 2>&1; then
    echo "  skip $label — volume $vol_name not found"
    return 0
  fi

  if [ "$kind" = "mongo-db" ] && [ "$MONGO_DB_COPIED" = true ]; then
    echo "  skip $label — MongoDB db already copied from legacy volume"
    return 0
  fi
  if [ "$kind" = "mongo-config" ] && [ "$MONGO_CONFIG_COPIED" = true ]; then
    echo "  skip $label — MongoDB config already copied from legacy volume"
    return 0
  fi

  if [ -n "$(ls -A "$dest_dir" 2>/dev/null || true)" ]; then
    if [ "$REPLACE" != true ]; then
      echo "  skip $label — $dest_dir already has data (use --replace to backup and overwrite)"
      return 0
    fi
    local backup="${dest_dir}.bak-$(date +%Y%m%d-%H%M%S)"
    echo "  backup $label: $dest_dir → $backup"
    mv "$dest_dir" "$backup"
  fi

  echo "  copy $label: $vol_name → $dest_dir"
  mkdir -p "$dest_dir"
  docker run --rm \
    -v "${vol_name}:/from:ro" \
    -v "${dest_dir}:/to" \
    alpine:3.20 \
    sh -c 'cp -a /from/. /to/'

  if [ "$kind" = "mongo-db" ]; then
    MONGO_DB_COPIED=true
    cat >"${dest_dir}/../MIGRATION_SOURCE.txt" <<EOF
Migrated from Docker volume: ${vol_name}
Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Tool: scripts/migrate-legacy-docker-volumes.sh
EOF
  fi
  if [ "$kind" = "mongo-config" ]; then
    MONGO_CONFIG_COPIED=true
  fi
}

if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'kanboard-mongodb'; then
  echo "ERROR: kanboard-mongodb is running. Stop it first:" >&2
  echo "  docker compose stop mongodb" >&2
  exit 1
fi

echo "Target data directory: $DATA_ROOT"
echo "Looking for legacy volumes (prefix ${COMPOSE_PROJECT}_ and atlboard-new / kanboard-new / kanboard)"
echo ""

copy_volume_if_needed "${COMPOSE_PROJECT}_mongo-data" "${DATA_ROOT}/mongodb/db" "MongoDB" mongo-db
copy_volume_if_needed "${COMPOSE_PROJECT}_mongo-config" "${DATA_ROOT}/mongodb/configdb" "MongoDB config" mongo-config
copy_volume_if_needed "${COMPOSE_PROJECT}_redis-data" "${DATA_ROOT}/redis" "Redis"
copy_volume_if_needed "${COMPOSE_PROJECT}_minio-data" "${DATA_ROOT}/minio" "MinIO"

for prefix in atlboard-new kanboard-new kanboard; do
  copy_volume_if_needed "${prefix}_mongo-data" "${DATA_ROOT}/mongodb/db" "MongoDB ($prefix)" mongo-db
  copy_volume_if_needed "${prefix}_mongo-config" "${DATA_ROOT}/mongodb/configdb" "MongoDB config ($prefix)" mongo-config
  copy_volume_if_needed "${prefix}_redis-data" "${DATA_ROOT}/redis" "Redis ($prefix)"
  copy_volume_if_needed "${prefix}_minio-data" "${DATA_ROOT}/minio" "MinIO ($prefix)"
done

echo ""
echo "Done. Start the stack:"
echo "  docker compose up -d mongodb && docker compose up --no-deps mongodb-init"
echo "  ./scripts/dev-start.sh"
