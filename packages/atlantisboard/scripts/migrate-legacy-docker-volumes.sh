#!/usr/bin/env bash
# One-time helper: copy data from legacy Docker named volumes into .docker-data bind mounts.
# Safe to run multiple times; skips volumes that are missing or already migrated.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_ROOT="$("${SCRIPT_DIR}/ensure-docker-data-dirs.sh")"

# Compose project name prefix (directory name by default).
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$PROJECT_ROOT")}"

copy_volume_if_needed() {
  local vol_name="$1"
  local dest_dir="$2"
  local label="$3"

  if ! docker volume inspect "$vol_name" >/dev/null 2>&1; then
    echo "  skip $label — volume $vol_name not found"
    return 0
  fi

  if [ -n "$(ls -A "$dest_dir" 2>/dev/null || true)" ]; then
    echo "  skip $label — $dest_dir already has data"
    return 0
  fi

  echo "  copy $label: $vol_name → $dest_dir"
  mkdir -p "$dest_dir"
  docker run --rm \
    -v "${vol_name}:/from:ro" \
    -v "${dest_dir}:/to" \
    alpine:3.20 \
    sh -c 'cp -a /from/. /to/ 2>/dev/null || true'
}

echo "Target data directory: $DATA_ROOT"
echo "Looking for legacy volumes with prefix: ${COMPOSE_PROJECT}_"
echo ""

copy_volume_if_needed "${COMPOSE_PROJECT}_mongo-data" "${DATA_ROOT}/mongodb/db" "MongoDB"
copy_volume_if_needed "${COMPOSE_PROJECT}_mongo-config" "${DATA_ROOT}/mongodb/configdb" "MongoDB config"
copy_volume_if_needed "${COMPOSE_PROJECT}_redis-data" "${DATA_ROOT}/redis" "Redis"
copy_volume_if_needed "${COMPOSE_PROJECT}_minio-data" "${DATA_ROOT}/minio" "MinIO"

# Older project folder names
for prefix in atlboard-new kanboard-new kanboard; do
  copy_volume_if_needed "${prefix}_mongo-data" "${DATA_ROOT}/mongodb/db" "MongoDB ($prefix)"
  copy_volume_if_needed "${prefix}_redis-data" "${DATA_ROOT}/redis" "Redis ($prefix)"
  copy_volume_if_needed "${prefix}_minio-data" "${DATA_ROOT}/minio" "MinIO ($prefix)"
done

echo ""
echo "Done. Start the stack with: ./scripts/dev-start.sh"
