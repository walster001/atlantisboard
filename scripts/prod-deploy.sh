#!/bin/bash
# Production deployment script - One-click production deployment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/deploy-prod-$(date +%Y%m%d-%H%M%S).log"

# Create logs directory
mkdir -p "$LOG_DIR"

# Function to log messages
log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Function to handle script exit
cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    log "Production deployment failed with exit code $exit_code"
    echo -e "${RED}Deployment failed! Check logs: $LOG_FILE${NC}"
  fi
  exit $exit_code
}

trap cleanup EXIT INT TERM

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Kanboard Production Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Step 1: Check prerequisites
log "Checking prerequisites..."
if ! "$SCRIPT_DIR/check-prerequisites.sh" >> "$LOG_FILE" 2>&1; then
  echo -e "${RED}Prerequisites check failed. See log: $LOG_FILE${NC}"
  exit 1
fi
echo ""

# Step 2: Validate production environment
log "Validating production environment..."
if [ ! -f "$PROJECT_ROOT/.env" ]; then
  echo -e "${RED}.env file not found!${NC}"
  echo -e "${YELLOW}Please create .env file with production configuration${NC}"
  exit 1
fi

# Load environment variables
set +u
# shellcheck disable=SC1090
source "$PROJECT_ROOT/.env" 2>/dev/null || true
set -u

# Validate critical production variables
CRITICAL_VARS=("JWT_SECRET" "SESSION_SECRET" "CSRF_SECRET" "ENCRYPTION_KEY")
INSECURE_SECRET_PATTERNS=(
  "change-this-to-a-secure-random-string-in-production"
  "change-this-secret-in-production"
  "your-secret-key-change-in-production"
  "change-this-session-secret-in-production"
  "your-session-secret-change-in-production"
  "change-this-csrf-secret-in-production"
)
MIN_SECRET_LENGTH=32
MISSING_VARS=()

is_insecure_secret() {
  local value="$1"
  if [ -z "$value" ]; then
    return 0
  fi
  if [ "${#value}" -lt "$MIN_SECRET_LENGTH" ]; then
    return 0
  fi
  for pattern in "${INSECURE_SECRET_PATTERNS[@]}"; do
    if [ "$value" = "$pattern" ]; then
      return 0
    fi
  done
  return 1
}

for var in "${CRITICAL_VARS[@]}"; do
  var_value=$(grep "^${var}=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2- || echo "")
  if is_insecure_secret "$var_value"; then
    MISSING_VARS+=("$var")
  fi
done

# Require non-default MinIO and Redis credentials in production
MINIO_ACCESS_KEY_VALUE=$(grep "^MINIO_ACCESS_KEY=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2- || echo "")
MINIO_SECRET_KEY_VALUE=$(grep "^MINIO_SECRET_KEY=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2- || echo "")
REDIS_PASSWORD_VALUE=$(grep "^REDIS_PASSWORD=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2- || echo "")

if [ -z "$MINIO_ACCESS_KEY_VALUE" ] || [ "$MINIO_ACCESS_KEY_VALUE" = "minioadmin" ]; then
  MISSING_VARS+=("MINIO_ACCESS_KEY")
fi
if [ -z "$MINIO_SECRET_KEY_VALUE" ] || [ "$MINIO_SECRET_KEY_VALUE" = "minioadmin" ]; then
  MISSING_VARS+=("MINIO_SECRET_KEY")
fi
if [ -z "$REDIS_PASSWORD_VALUE" ]; then
  MISSING_VARS+=("REDIS_PASSWORD")
fi

CORS_ORIGIN_VALUE=$(grep "^CORS_ORIGIN=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2- || echo "")
if [ -z "$CORS_ORIGIN_VALUE" ] || echo "$CORS_ORIGIN_VALUE" | grep -q '\*'; then
  MISSING_VARS+=("CORS_ORIGIN")
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo -e "${RED}Critical production variables are missing or invalid:${NC}"
  for var in "${MISSING_VARS[@]}"; do
    echo -e "  ${RED}- $var${NC}"
  done
  echo -e "${RED}Please set secure values for these variables in .env before deploying to production${NC}"
  exit 1
fi

# Check NODE_ENV
if [ "${NODE_ENV:-}" != "production" ]; then
  echo -e "${YELLOW}Warning: NODE_ENV is not set to 'production'${NC}"
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

echo -e "${GREEN}✓${NC} Production environment validated"
echo ""

# Step 3: Build Docker image
log "Building Docker image..."
cd "$PROJECT_ROOT"
echo -e "${BLUE}Building application Docker image...${NC}"
docker build -t kanboard:latest . >> "$LOG_FILE" 2>&1 || {
  echo -e "${RED}Failed to build Docker image${NC}"
  exit 1
}
echo -e "${GREEN}✓${NC} Docker image built successfully"
echo ""

# Step 4: Stop existing services (if running)
log "Stopping existing services..."
if docker compose -f docker-compose.prod.yml ps --services --filter "status=running" | grep -q "."; then
  echo -e "${YELLOW}Stopping existing production services...${NC}"
  docker compose -f docker-compose.prod.yml down >> "$LOG_FILE" 2>&1 || true
fi
echo ""

# Step 5: Start all services
log "Starting production services..."
echo -e "${BLUE}Starting all production services...${NC}"
docker compose -f docker-compose.prod.yml up -d >> "$LOG_FILE" 2>&1 || {
  echo -e "${RED}Failed to start production services${NC}"
  exit 1
}
echo -e "${GREEN}✓${NC} Production services started"
echo ""

# Step 6: Wait for services to be healthy
log "Waiting for services to be ready..."
APP_URL="http://localhost:${PORT:-3000}"
if ! "$SCRIPT_DIR/wait-for-services.sh" "$APP_URL/health" >> "$LOG_FILE" 2>&1; then
  echo -e "${YELLOW}Some services may not be ready yet. Checking status...${NC}"
  sleep 10
fi
echo ""

# Step 7: Verify application health
log "Verifying application health..."
sleep 5  # Give app a moment to start
if curl -f "$APP_URL/health" >/dev/null 2>&1; then
  HEALTH_RESPONSE=$(curl -s "$APP_URL/health" 2>/dev/null || echo "")
  if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}✓${NC} Application health check passed"
  else
    echo -e "${YELLOW}⚠${NC} Application responded but health status unknown"
  fi
else
  echo -e "${YELLOW}⚠${NC} Application health check failed (may still be starting)"
  echo -e "${BLUE}Check logs with: docker compose -f docker-compose.prod.yml logs app${NC}"
fi
echo ""

# Step 8: Show deployment status
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Production Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Service Status:${NC}"
docker compose -f docker-compose.prod.yml ps
echo ""
echo -e "${BLUE}Application URLs:${NC}"
echo -e "  Application: ${GREEN}${APP_URL}${NC}"
echo -e "  Health Check: ${GREEN}${APP_URL}/health${NC}"
echo -e "  Note: MongoDB, Redis, and MinIO are internal-only (not published to the host)."
echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo -e "  View logs: ${YELLOW}docker compose -f docker-compose.prod.yml logs -f${NC}"
echo -e "  View app logs: ${YELLOW}docker compose -f docker-compose.prod.yml logs -f app${NC}"
echo -e "  Stop services: ${YELLOW}docker compose -f docker-compose.prod.yml down${NC}"
echo -e "  Restart app: ${YELLOW}docker compose -f docker-compose.prod.yml restart app${NC}"
echo ""
echo -e "${BLUE}Health Check:${NC}"
echo -e "  Run: ${YELLOW}$SCRIPT_DIR/health-check.sh ${APP_URL}${NC}"
echo ""

# Option to view logs
read -p "View application logs now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  docker compose -f docker-compose.prod.yml logs -f app
fi

