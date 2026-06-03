#!/bin/bash
# Wraps the official mongo image entrypoint.
# Replica set + root auth requires a keyFile.
# Generates /data/replica.key on first start.
# The file persists in the mongo data volume.
set -euo pipefail

KEYFILE=/data/replica.key

if [[ ! -s "$KEYFILE" ]]; then
  openssl rand -base64 756 >"$KEYFILE"
fi
chmod 400 "$KEYFILE"
# mongo:8 image runs as mongodb (uid 999)
chown mongodb:mongodb "$KEYFILE" 2>/dev/null || chown 999:999 "$KEYFILE"

exec /usr/local/bin/docker-entrypoint.sh "$@"
