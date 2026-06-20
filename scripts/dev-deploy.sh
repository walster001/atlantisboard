#!/bin/bash
# Development deployment script - One-click development environment setup

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
LOG_FILE="$LOG_DIR/deploy-$(date +%Y%m%d-%H%M%S).log"

# Create logs directory
mkdir -p "$LOG_DIR"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/cleanup-old-logs.sh"
cleanup_old_logs "$LOG_DIR" 'deploy-*.log' 7

# Function to log messages
log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Function to handle script exit
cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    log "Deployment failed with exit code $exit_code"
    echo -e "${RED}Deployment failed! Check logs: $LOG_FILE${NC}"
  fi
  exit $exit_code
}

trap cleanup EXIT

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Kanboard Development Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Step 1: Check prerequisites
log "Checking prerequisites..."
if ! "$SCRIPT_DIR/check-prerequisites.sh" >> "$LOG_FILE" 2>&1; then
  echo -e "${RED}Prerequisites check failed. See log: $LOG_FILE${NC}"
  exit 1
fi
echo ""

# Step 2: Setup environment
log "Setting up environment..."
if ! "$SCRIPT_DIR/setup-env.sh" >> "$LOG_FILE" 2>&1; then
  echo -e "${RED}Environment setup failed. See log: $LOG_FILE${NC}"
  exit 1
fi
echo ""

# Step 3: Start Docker services
log "Starting Docker services..."
cd "$PROJECT_ROOT"
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.env"
  set +a
fi
DOCKER_DATA_DIR="$("$SCRIPT_DIR/ensure-docker-data-dirs.sh")"
echo -e "${BLUE}Docker dev data:${NC} ${DOCKER_DATA_DIR}"
echo -e "${YELLOW}Never run:${NC} docker compose down -v  (see docs/DOCKER-DEV-DATA.md)"
echo ""
if docker compose ps --services --filter "status=running" | grep -q "mongodb\|redis\|minio"; then
  echo -e "${YELLOW}Some Docker services are already running${NC}"
  read -p "Restart all services? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker compose down >> "$LOG_FILE" 2>&1
  fi
fi

echo -e "${BLUE}Starting MongoDB, Redis, and MinIO...${NC}"
docker compose up -d >> "$LOG_FILE" 2>&1 || {
  echo -e "${RED}Failed to start Docker services${NC}"
  exit 1
}
echo -e "${GREEN}✓${NC} Docker services started"
log "Pruning unused Docker images and build cache..."
docker image prune -f >> "$LOG_FILE" 2>&1 || true
docker builder prune -f >> "$LOG_FILE" 2>&1 || true
echo ""

# Step 4: Wait for services to be healthy
log "Waiting for services to be ready..."
if ! "$SCRIPT_DIR/wait-for-services.sh" >> "$LOG_FILE" 2>&1; then
  echo -e "${RED}Services failed to become ready${NC}"
  echo -e "${YELLOW}Check service logs: docker compose logs${NC}"
  exit 1
fi
echo ""

# Step 5: Install dependencies
log "Installing dependencies..."
cd "$PROJECT_ROOT"
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
  echo -e "${BLUE}Installing dependencies with Bun...${NC}"
  export PATH="$HOME/.bun/bin:$PATH"
  bun install >> "$LOG_FILE" 2>&1 || {
    echo -e "${RED}Failed to install dependencies${NC}"
    exit 1
  }
  echo -e "${GREEN}✓${NC} Dependencies installed"
else
  echo -e "${GREEN}✓${NC} Dependencies already installed"
fi
echo ""

# Step 6: Initialize database
log "Initializing database..."
if ! "$SCRIPT_DIR/init-database.sh" >> "$LOG_FILE" 2>&1; then
  echo -e "${YELLOW}Database initialization had issues (may be OK if app handles it)${NC}"
fi
echo ""

# Step 7: Type check
log "Running TypeScript type check..."
export PATH="$HOME/.bun/bin:$PATH"
if bun run typecheck >> "$LOG_FILE" 2>&1; then
  echo -e "${GREEN}✓${NC} TypeScript type check passed"
else
  echo -e "${YELLOW}⚠${NC} TypeScript type check found errors (check log for details)"
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi
echo ""

# Step 8: Setup complete
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  Run './scripts/dev-start.sh' or 'bun run dev-start' to start Docker services and development server"
echo -e "  Or run 'bun run dev' to start only the development server (if services are already running)"
echo ""

