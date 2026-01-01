#!/bin/bash
# =====================================================
# AtlantisBoard Backend - Start Development Services
# =====================================================
# Starts all services for local development
# =====================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

# PID files
BACKEND_PID_FILE="$BACKEND_DIR/.dev-api.pid"
BACKEND_LOG_FILE="$BACKEND_DIR/.dev-api.log"

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Shutting down services...${NC}"
    
    # Stop backend API if running
    if [ -f "$BACKEND_PID_FILE" ]; then
        BACKEND_PID=$(cat "$BACKEND_PID_FILE")
        if ps -p "$BACKEND_PID" > /dev/null 2>&1; then
            echo -e "${BLUE}   Stopping backend API (PID: $BACKEND_PID)...${NC}"
            kill "$BACKEND_PID" 2>/dev/null || true
            wait "$BACKEND_PID" 2>/dev/null || true
        fi
        rm -f "$BACKEND_PID_FILE"
    fi
    
    echo -e "${GREEN}✅ Cleanup complete${NC}"
    exit 0
}

# Trap Ctrl+C
trap cleanup INT TERM

cd "$PROJECT_ROOT"

echo -e "${BLUE}🚀 Starting AtlantisBoard Development Environment${NC}"
echo ""

# Check if .env exists
if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo -e "${RED}❌ backend/.env not found${NC}"
    echo -e "${YELLOW}   Please run setup first:${NC}"
    echo -e "${GREEN}   ./scripts/dev-setup-backend.sh${NC}"
    exit 1
fi

# Start Docker services
echo -e "${BLUE}🐳 Starting Docker services...${NC}"
cd "$BACKEND_DIR"

# Load environment variables
set -a
source .env 2>/dev/null || true
set +a

# Start services
if docker compose version &> /dev/null 2>&1; then
    docker compose up -d
else
    docker-compose up -d
fi

echo -e "${GREEN}✅ Docker services started${NC}"

# Wait for PostgreSQL
echo ""
echo -e "${BLUE}⏳ Waiting for PostgreSQL...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0
POSTGRES_READY=false

# Get database name and user from env or use defaults
DB_NAME=${POSTGRES_DB:-atlantisboard}
DB_USER=${POSTGRES_USER:-postgres}

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    # Try to find PostgreSQL container
    CONTAINER_NAME=$(docker ps --format "{{.Names}}" | grep -E "postgres|atlantisboard.*postgres" | head -n1)
    if [ -n "$CONTAINER_NAME" ] && docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" &> /dev/null 2>&1; then
        POSTGRES_READY=true
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -n "."
    sleep 1
done
echo ""

if [ "$POSTGRES_READY" = true ]; then
    echo -e "${GREEN}✅ PostgreSQL is ready${NC}"
else
    echo -e "${RED}❌ PostgreSQL did not become ready${NC}"
    echo -e "${YELLOW}   Check logs: docker logs atlantisboard-postgres${NC}"
    exit 1
fi

# Wait for MinIO
echo ""
echo -e "${BLUE}⏳ Waiting for MinIO...${NC}"
MAX_RETRIES=10
RETRY_COUNT=0
MINIO_READY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f http://localhost:9000/minio/health/live &> /dev/null 2>&1; then
        MINIO_READY=true
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 2
done

if [ "$MINIO_READY" = true ]; then
    echo -e "${GREEN}✅ MinIO is ready${NC}"
else
    echo -e "${YELLOW}⚠️  MinIO health check failed, but continuing...${NC}"
fi

# Start backend API server in background
echo ""
echo -e "${BLUE}🔧 Starting backend API server...${NC}"
cd "$BACKEND_DIR"

# Check if already running
if [ -f "$BACKEND_PID_FILE" ]; then
    OLD_PID=$(cat "$BACKEND_PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Backend API already running (PID: $OLD_PID)${NC}"
        echo -e "${YELLOW}   Stopping old process...${NC}"
        kill "$OLD_PID" 2>/dev/null || true
        wait "$OLD_PID" 2>/dev/null || true
    fi
    rm -f "$BACKEND_PID_FILE"
fi

# Start backend in background
npm run dev > "$BACKEND_LOG_FILE" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$BACKEND_PID_FILE"

# Wait a moment to check if it started successfully
sleep 2
if ! ps -p "$BACKEND_PID" > /dev/null 2>&1; then
    echo -e "${RED}❌ Backend API failed to start${NC}"
    echo -e "${YELLOW}   Check logs: tail -f $BACKEND_LOG_FILE${NC}"
    rm -f "$BACKEND_PID_FILE"
    exit 1
fi

echo -e "${GREEN}✅ Backend API started (PID: $BACKEND_PID)${NC}"
echo -e "${BLUE}   Logs: tail -f $BACKEND_LOG_FILE${NC}"

# Start frontend dev server in foreground
echo ""
echo -e "${BLUE}🎨 Starting frontend dev server...${NC}"
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ All services started!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "  Frontend:    ${GREEN}http://127.0.0.1:8080${NC}"
echo -e "  Backend API: ${GREEN}http://127.0.0.1:3000${NC}"
echo -e "  MinIO:       ${GREEN}http://127.0.0.1:9000${NC}"
echo -e "  MinIO Console: ${GREEN}http://127.0.0.1:9001${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

cd "$PROJECT_ROOT"

# Start frontend (this will run in foreground)
npm run dev

