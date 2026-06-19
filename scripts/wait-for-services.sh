#!/bin/bash
# Service health checker - wait for Docker services to be healthy

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=probe-services.sh
source "$SCRIPT_DIR/probe-services.sh"

TIMEOUT=${TIMEOUT:-60}
MAX_RETRIES=12
RETRY_DELAY=5

probe_services_load_env

# Function to wait for MongoDB
wait_for_mongodb() {
  echo -e "${BLUE}Waiting for MongoDB to be ready...${NC}"
  local count=0
  while [ $count -lt $MAX_RETRIES ]; do
    if probe_mongodb; then
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
    if ! probe_redis_container_running; then
      echo -n "."
      sleep $RETRY_DELAY
      count=$((count + 1))
      continue
    fi
    if probe_redis; then
      echo -e "${GREEN}✓${NC} Redis is ready"
      return 0
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
    if probe_minio; then
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
