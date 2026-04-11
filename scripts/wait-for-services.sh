#!/bin/bash
# Service health checker - wait for Docker services to be healthy

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

TIMEOUT=${TIMEOUT:-60}
MAX_RETRIES=12
RETRY_DELAY=5

# Try to load REDIS_PASSWORD from .env if available
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ -f "$PROJECT_ROOT/.env" ]; then
  set +u
  # shellcheck disable=SC1090
  source "$PROJECT_ROOT/.env" 2>/dev/null || true
  set -u
fi

# Function to wait for MongoDB
wait_for_mongodb() {
  echo -e "${BLUE}Waiting for MongoDB to be ready...${NC}"
  local count=0
  while [ $count -lt $MAX_RETRIES ]; do
    if docker exec kanboard-mongodb mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
      echo -e "${GREEN}✓${NC} MongoDB is ready"
      return 0
    fi
    echo -n "."
    sleep $RETRY_DELAY
    count=$((count + 1))
  done
  echo ""
  echo -e "${RED}✗${NC} MongoDB failed to become ready within timeout"
  return 1
}

# Function to wait for Redis
wait_for_redis() {
  echo -e "${BLUE}Waiting for Redis to be ready...${NC}"
  local count=0
  while [ $count -lt $MAX_RETRIES ]; do
    # Check if container is running first
    if ! docker ps --format '{{.Names}}' | grep -q "^kanboard-redis$"; then
      echo -n "."
      sleep $RETRY_DELAY
      count=$((count + 1))
      continue
    fi
    # Try ping (if password is set and non-empty, use it; otherwise try without)
    if [ -n "${REDIS_PASSWORD:-}" ]; then
      if docker exec kanboard-redis redis-cli -a "${REDIS_PASSWORD}" ping >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Redis is ready"
        return 0
      fi
    else
      if docker exec kanboard-redis redis-cli ping >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Redis is ready"
        return 0
      fi
    fi
    echo -n "."
    sleep $RETRY_DELAY
    count=$((count + 1))
  done
  echo ""
  echo -e "${RED}✗${NC} Redis failed to become ready within timeout"
  return 1
}

# Function to wait for MinIO
wait_for_minio() {
  echo -e "${BLUE}Waiting for MinIO to be ready...${NC}"
  local count=0
  while [ $count -lt $MAX_RETRIES ]; do
    if docker exec kanboard-minio curl -f http://localhost:9000/minio/health/live >/dev/null 2>&1 || \
       curl -f http://localhost:9000/minio/health/live >/dev/null 2>&1; then
      echo -e "${GREEN}✓${NC} MinIO is ready"
      return 0
    fi
    echo -n "."
    sleep $RETRY_DELAY
    count=$((count + 1))
  done
  echo ""
  echo -e "${RED}✗${NC} MinIO failed to become ready within timeout"
  return 1
}

# Function to wait for application health endpoint
wait_for_app() {
  local url=${1:-"http://localhost:3000/health"}
  echo -e "${BLUE}Waiting for application to be ready...${NC}"
  local count=0
  while [ $count -lt $MAX_RETRIES ]; do
    if curl -f "$url" >/dev/null 2>&1; then
      echo -e "${GREEN}✓${NC} Application is ready"
      return 0
    fi
    echo -n "."
    sleep $RETRY_DELAY
    count=$((count + 1))
  done
  echo ""
  echo -e "${RED}✗${NC} Application failed to become ready within timeout"
  return 1
}

# Main execution
SERVICES_OK=0

# Wait for MongoDB
if ! wait_for_mongodb; then
  SERVICES_OK=$((SERVICES_OK + 1))
fi

# Wait for Redis
if ! wait_for_redis; then
  SERVICES_OK=$((SERVICES_OK + 1))
fi

# Wait for MinIO
if ! wait_for_minio; then
  SERVICES_OK=$((SERVICES_OK + 1))
fi

# Wait for application if URL provided
if [ -n "${1:-}" ]; then
  if ! wait_for_app "$1"; then
    SERVICES_OK=$((SERVICES_OK + 1))
  fi
fi

if [ $SERVICES_OK -eq 0 ]; then
  echo -e "${GREEN}All services are ready!${NC}"
  exit 0
else
  echo -e "${RED}Some services failed to become ready${NC}"
  exit 1
fi

