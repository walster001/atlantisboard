#!/usr/bin/env bash
# Warn when legacy Docker named volumes exist but bind-mount data dirs are empty.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_ROOT="$("${SCRIPT_DIR}/ensure-docker-data-dirs.sh")"
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$PROJECT_ROOT")}"

mongo_empty=true
if [ -n "$(ls -A "${DATA_ROOT}/mongodb/db" 2>/dev/null || true)" ]; then
  mongo_empty=false
fi

if [ "$mongo_empty" = false ]; then
  exit 0
fi

legacy_vol=""
for candidate in \
  "${COMPOSE_PROJECT}_mongo-data" \
  "atlboard-new_mongo-data" \
  "kanboard-new_mongo-data" \
  "kanboard_mongo-data"; do
  if docker volume inspect "$candidate" >/dev/null 2>&1; then
    legacy_vol="$candidate"
    break
  fi
done

if [ -z "$legacy_vol" ]; then
  exit 0
fi

echo ""
echo "WARNING: ${DATA_ROOT}/mongodb/db is empty but Docker volume ${legacy_vol} still exists."
echo "         Your previous dev data may be in that volume — migrate before starting MongoDB:"
echo "         ./scripts/migrate-legacy-docker-volumes.sh"
echo ""
