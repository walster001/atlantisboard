#!/usr/bin/env bash
# Ensures host directories exist for docker-compose bind-mounted dev data.
# Called from scripts/dev-start.sh and scripts/dev-deploy.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DATA_ROOT="${KANBOARD_DOCKER_DATA_DIR:-${PROJECT_ROOT}/.docker-data}"

if [[ "$DATA_ROOT" != /* ]]; then
  DATA_ROOT="$(cd "$PROJECT_ROOT" && cd "$(dirname "$DATA_ROOT")" && pwd)/$(basename "$DATA_ROOT")"
fi

mkdir -p \
  "${DATA_ROOT}/mongodb/db" \
  "${DATA_ROOT}/mongodb/configdb" \
  "${DATA_ROOT}/redis" \
  "${DATA_ROOT}/minio"

# Marker file so we can warn if someone deletes the tree accidentally.
if [ ! -f "${DATA_ROOT}/README.txt" ]; then
  cat >"${DATA_ROOT}/README.txt" <<'EOF'
Kanboard local development data (MongoDB, Redis, MinIO).

This directory is bind-mounted by docker-compose.yml. Your databases and object
storage live here on the host filesystem — not only inside Docker named volumes.

SAFE:
  docker compose stop
  docker compose down          (without -v)
  docker compose up -d

DESTRUCTIVE (deletes everything under .docker-data if you also remove this folder):
  docker compose down -v
  docker volume prune
  docker system prune --volumes

Back up this folder regularly (or use Admin → Backups in the app).
EOF
fi

echo "$DATA_ROOT"
