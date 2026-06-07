#!/usr/bin/env bash
# Count users in kanboard for a MongoDB data directory or Docker named volume.
#
# Usage:
#   probe-mongo-data-dir-users.sh /path/to/mongodb/db [probe_port]
#   probe-mongo-data-dir-users.sh --volume atlboard-new_mongo-data [probe_port]

set -euo pipefail

PROBE_PORT="27019"
MOUNT_SOURCE=""
MOUNT_MODE="bind"

if [ "${1:-}" = "--volume" ]; then
  VOL_NAME="${2:?volume name required}"
  PROBE_PORT="${3:-27020}"
  if ! docker volume inspect "$VOL_NAME" >/dev/null 2>&1; then
    echo 0
    exit 0
  fi
  MOUNT_SOURCE="${VOL_NAME}:/data/db"
  MOUNT_MODE="volume"
else
  DATA_DIR="${1:?data directory or --volume required}"
  PROBE_PORT="${2:-27019}"
  if [ ! -d "$DATA_DIR" ] || [ -z "$(ls -A "$DATA_DIR" 2>/dev/null || true)" ]; then
    echo 0
    exit 0
  fi
  MOUNT_SOURCE="${DATA_DIR}:/data/db"
fi

CONTAINER="kanboard-mongo-probe-${RANDOM}"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [ "$MOUNT_MODE" = "volume" ]; then
  if ! docker run -d --name "$CONTAINER" \
    -v "$MOUNT_SOURCE" \
    -p "127.0.0.1:${PROBE_PORT}:27017" \
    mongo:8.0.4 \
    mongod --replSet rs0 --bind_ip_all >/dev/null 2>&1; then
    echo 0
    exit 0
  fi
else
  if ! docker run -d --name "$CONTAINER" \
    -v "$MOUNT_SOURCE" \
    -p "127.0.0.1:${PROBE_PORT}:27017" \
    mongo:8.0.4 \
    mongod --replSet rs0 --bind_ip_all >/dev/null 2>&1; then
    echo 0
    exit 0
  fi
fi

sleep 4
docker exec "$CONTAINER" mongosh --quiet --eval \
  "try{rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:${PROBE_PORT}'}]})}catch(e){}" \
  >/dev/null 2>&1 || true
sleep 2

COUNT="$(docker exec "$CONTAINER" mongosh kanboard --quiet --eval "db.users.countDocuments()" 2>/dev/null | tr -cd '0-9' || true)"
if [ -z "$COUNT" ]; then
  echo 0
else
  echo "$COUNT"
fi
