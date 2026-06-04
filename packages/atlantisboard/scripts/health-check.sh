#!/bin/bash
# Health check utility

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

APP_URL=${1:-"http://localhost:3000"}

echo -e "${BLUE}=== Health Check Report ===${NC}"
echo ""

# Check Docker services
echo -e "${BLUE}Docker Services:${NC}"
SERVICES=("kanboard-mongodb:27017" "kanboard-redis:6379" "kanboard-minio:9000")
SERVICES_OK=0

for service in "${SERVICES[@]}"; do
  SERVICE_NAME=$(echo "$service" | cut -d':' -f1)
  if docker ps --format '{{.Names}}' | grep -q "^${SERVICE_NAME}$"; then
    echo -e "${GREEN}✓${NC} $SERVICE_NAME is running"
  else
    echo -e "${RED}✗${NC} $SERVICE_NAME is not running"
    SERVICES_OK=$((SERVICES_OK + 1))
  fi
done
echo ""

# Check MongoDB connectivity
echo -e "${BLUE}MongoDB Connectivity:${NC}"
if docker exec kanboard-mongodb mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} MongoDB is accessible"
else
  echo -e "${RED}✗${NC} MongoDB is not accessible"
  SERVICES_OK=$((SERVICES_OK + 1))
fi
echo ""

# Check Redis connectivity
echo -e "${BLUE}Redis Connectivity:${NC}"
# Try to load REDIS_PASSWORD from .env if available
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ -f "$PROJECT_ROOT/.env" ]; then
  set +u
  # shellcheck disable=SC1090
  source "$PROJECT_ROOT/.env" 2>/dev/null || true
  set -u
fi

if [ -n "${REDIS_PASSWORD:-}" ]; then
  if docker exec kanboard-redis redis-cli -a "${REDIS_PASSWORD}" ping >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Redis is accessible"
  else
    echo -e "${RED}✗${NC} Redis is not accessible"
    SERVICES_OK=$((SERVICES_OK + 1))
  fi
else
  if docker exec kanboard-redis redis-cli ping >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Redis is accessible"
  else
    echo -e "${RED}✗${NC} Redis is not accessible"
    SERVICES_OK=$((SERVICES_OK + 1))
  fi
fi
echo ""

# Check MinIO connectivity
echo -e "${BLUE}MinIO Connectivity:${NC}"
if curl -f "${APP_URL/http:\/\/localhost/http://localhost}:9000/minio/health/live" >/dev/null 2>&1 || \
   docker exec kanboard-minio curl -f http://localhost:9000/minio/health/live >/dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} MinIO is accessible"
else
  echo -e "${RED}✗${NC} MinIO is not accessible"
  SERVICES_OK=$((SERVICES_OK + 1))
fi
echo ""

# Check application health endpoint
echo -e "${BLUE}Application Health:${NC}"
HEALTH_URL="${APP_URL}/health"
if curl -f "$HEALTH_URL" >/dev/null 2>&1; then
  HEALTH_RESPONSE=$(curl -s "$HEALTH_URL" 2>/dev/null || echo "")
  if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}✓${NC} Application health check passed"
    echo -e "  Response: $HEALTH_RESPONSE"
  else
    echo -e "${YELLOW}⚠${NC} Application responded but health status unknown"
    echo -e "  Response: $HEALTH_RESPONSE"
    SERVICES_OK=$((SERVICES_OK + 1))
  fi
else
  echo -e "${RED}✗${NC} Application health check failed"
  echo -e "  URL: $HEALTH_URL"
  SERVICES_OK=$((SERVICES_OK + 1))
fi
echo ""

# Summary
echo -e "${BLUE}=== Summary ===${NC}"
if [ $SERVICES_OK -eq 0 ]; then
  echo -e "${GREEN}All health checks passed!${NC}"
  exit 0
else
  echo -e "${RED}Found $SERVICES_OK issue(s)${NC}"
  exit 1
fi

