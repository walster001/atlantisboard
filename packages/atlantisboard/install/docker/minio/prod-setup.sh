#!/bin/sh
# Production MinIO bucket bootstrap and optional scoped application user.
set -eu

ROOT_KEY="${MINIO_ROOT_ACCESS_KEY:-${MINIO_ACCESS_KEY:-minioadmin}}"
ROOT_SECRET="${MINIO_ROOT_SECRET_KEY:-${MINIO_SECRET_KEY:-minioadmin}}"
APP_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
APP_SECRET="${MINIO_SECRET_KEY:-minioadmin}"

sleep 5
mc alias set myminio "http://minio:9000" "$ROOT_KEY" "$ROOT_SECRET"

for bucket in import-inline card-attachments branding fonts user-avatars backgrounds backups; do
  mc mb "myminio/${bucket}" --ignore-existing
done

if [ "$APP_KEY" != "$ROOT_KEY" ] || [ "$APP_SECRET" != "$ROOT_SECRET" ]; then
  mc admin policy rm myminio kanboard-app-rw 2>/dev/null || true
  mc admin policy create myminio kanboard-app-rw /policy/app-readwrite-policy.json
  mc admin user add myminio "$APP_KEY" "$APP_SECRET" 2>/dev/null || true
  mc admin policy attach myminio kanboard-app-rw --user "$APP_KEY" 2>/dev/null || true
  echo "scoped MinIO application user configured"
fi
