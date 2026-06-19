#!/usr/bin/env bash
# Shared Mongo/Redis/MinIO connectivity probes (sourced by health-check.sh and wait-for-services.sh)

probe_services_load_env() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)"
  local project_root
  project_root="$(cd "$script_dir/.." && pwd)"
  if [ -f "$project_root/.env" ]; then
    set +u
    # shellcheck disable=SC1090
    source "$project_root/.env" 2>/dev/null || true
    set -u
  fi
}

probe_mongodb() {
  docker exec kanboard-mongodb mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1
}

probe_redis_container_running() {
  docker ps --format '{{.Names}}' | grep -q "^kanboard-redis$"
}

probe_redis() {
  if [ -n "${REDIS_PASSWORD:-}" ]; then
    docker exec kanboard-redis redis-cli -a "${REDIS_PASSWORD}" ping >/dev/null 2>&1
  else
    docker exec kanboard-redis redis-cli ping >/dev/null 2>&1
  fi
}

probe_minio() {
  docker exec kanboard-minio curl -f http://localhost:9000/minio/health/live >/dev/null 2>&1 || \
    curl -f http://localhost:9000/minio/health/live >/dev/null 2>&1
}
