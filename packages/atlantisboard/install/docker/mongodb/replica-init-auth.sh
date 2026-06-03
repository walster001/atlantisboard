#!/bin/bash
# One-shot replica set initiation for production Compose.
# Runs after MongoDB is healthy.
set -euo pipefail

ROOT_USER="${MONGODB_ROOT_USER:?MONGODB_ROOT_USER is required}"
ROOT_PASS="${MONGODB_ROOT_PASSWORD:?MONGODB_ROOT_PASSWORD is required}"
MONGO_HOST="${MONGODB_HOST:-mongodb}"
MEMBER_HOST="${MONGODB_REPLICA_MEMBER_HOST:-${MONGO_HOST}:27017}"

MONGO_EVAL="$(cat <<EOF
  try {
    const status = rs.status();
    if (status && status.ok === 1) {
      print('replica set already initialized');
      quit(0);
    }
  } catch (e) {}
  rs.initiate({
    _id: 'rs0',
    members: [{ _id: 0, host: '${MEMBER_HOST}' }]
  });
  print('replica set rs0 initiated');
EOF
)"

mongosh --host "$MONGO_HOST" --port 27017 \
  -u "$ROOT_USER" \
  -p "$ROOT_PASS" \
  --authenticationDatabase admin \
  --quiet \
  --eval "$MONGO_EVAL"
