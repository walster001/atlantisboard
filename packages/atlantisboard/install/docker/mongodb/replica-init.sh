#!/bin/bash
# Init single-node replica set for local / npm Docker dependency stack (no auth).
set -euo pipefail

MONGO_HOST="${MONGODB_HOST:-mongodb}"
MEMBER_HOST="${MONGODB_REPLICA_MEMBER_HOST:-${MONGO_HOST}:27017}"

mongosh "mongodb://${MONGO_HOST}:27017" --quiet --eval "
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
"
