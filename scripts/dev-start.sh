#!/bin/bash
# Development start script - Starts containers and dev server with graceful shutdown
#
# RAM budget (~6 GiB total): Docker services capped in docker-compose.yml; Bun heaps in scripts/dev.ts.
# Optional: SKIP_DOCKER_PROMPT=1 — use existing containers without prompting (CI / non-interactive).
# Optional: DEV_PARENT_HEAP_MIB=384 — cap this script's Bun parent (default 384).

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Function to cleanup on exit
cleanup() {
  local exit_code=$?
  echo ""
  echo -e "${YELLOW}Shutting down...${NC}"
  
  # Kill dev server if running
  if [ -n "${DEV_PID:-}" ]; then
    echo -e "${BLUE}Stopping development server...${NC}"
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
  
  # Stop Docker containers
  echo -e "${BLUE}Stopping Docker containers...${NC}"
  cd "$PROJECT_ROOT"
  docker compose down >/dev/null 2>&1 || true
  
  echo -e "${GREEN}✓${NC} All services stopped"
  exit $exit_code
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM EXIT

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Starting Kanboard Development${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if .env exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
  echo -e "${RED}Error: .env file not found${NC}"
  echo -e "${YELLOW}Please run './scripts/dev-deploy.sh' or 'bun run dev-deploy' first to set up the environment${NC}"
  exit 1
fi

# Start Docker services
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
"$SCRIPT_DIR/check-docker-data-migration.sh" || true
echo ""
echo -e "${BLUE}Starting Docker services...${NC}"
RESTART_DOCKER=false
if docker compose ps --services --filter "status=running" | grep -q "mongodb\|redis\|minio"; then
  if [ -n "${SKIP_DOCKER_PROMPT:-}" ] && [ "${SKIP_DOCKER_PROMPT}" != "0" ]; then
    echo -e "${BLUE}Using existing Docker services (SKIP_DOCKER_PROMPT)...${NC}"
  elif [ ! -t 0 ]; then
    echo -e "${BLUE}Using existing Docker services (non-interactive stdin)...${NC}"
  else
    echo -e "${YELLOW}Some Docker services are already running${NC}"
    read -p "Restart all services? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      RESTART_DOCKER=true
    else
      echo -e "${BLUE}Using existing Docker services...${NC}"
    fi
  fi
  if [ "$RESTART_DOCKER" = true ]; then
    docker compose down
    docker compose up -d
    # Ensure MongoDB replica set is initialized (required for Change Streams)
    docker compose up --no-deps mongodb-init >/dev/null 2>&1 || true
  fi
else
  docker compose up -d
  # Ensure MongoDB replica set is initialized (required for Change Streams)
  docker compose up --no-deps mongodb-init >/dev/null 2>&1 || true
fi

# Wait for services to be healthy
echo -e "${BLUE}Waiting for services to be ready...${NC}"
if ! "$SCRIPT_DIR/wait-for-services.sh" >/dev/null 2>&1; then
  echo -e "${RED}Services failed to become ready${NC}"
  echo -e "${YELLOW}Check service logs: docker compose logs${NC}"
  exit 1
fi
echo -e "${GREEN}✓${NC} All services are ready"
echo ""

# Load environment variables
set +u
# shellcheck disable=SC1090
source "$PROJECT_ROOT/.env" 2>/dev/null || true
set -u

# Ensure dev defaults for Change Streams + replica set.
# (Do not mutate .env on disk; just export safe runtime defaults.)
if [ -z "${ENABLE_CHANGE_STREAMS:-}" ]; then
  export ENABLE_CHANGE_STREAMS=true
fi
if [ -n "${MONGODB_URI:-}" ] && ! echo "$MONGODB_URI" | grep -q "replicaSet="; then
  if echo "$MONGODB_URI" | grep -q "?"; then
    export MONGODB_URI="${MONGODB_URI}&replicaSet=rs0"
  else
    export MONGODB_URI="${MONGODB_URI}?replicaSet=rs0"
  fi
fi

# Cap parent Bun heap (orchestrator only; children use scripts/dev.ts)
PARENT_HEAP="${DEV_PARENT_HEAP_MIB:-384}"
if [[ "${NODE_OPTIONS:-}" != *max-old-space-size* ]]; then
  export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=${PARENT_HEAP}"
fi

# Start development server in background
echo -e "${BLUE}Starting development server...${NC}"
"$SCRIPT_DIR/ensure-dev-port-free.sh"
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Application will be available at:${NC}"
echo -e "${GREEN}  http://localhost:3000${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

export PATH="$HOME/.bun/bin:$PATH"
bun run dev &
DEV_PID=$!

# Wait for dev server process
wait $DEV_PID
