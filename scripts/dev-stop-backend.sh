#!/bin/bash
# =====================================================
# AtlantisBoard Backend - Stop Development Services
# =====================================================
# Stops all running development services
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

cd "$PROJECT_ROOT"

echo -e "${BLUE}🛑 Stopping AtlantisBoard Development Services${NC}"
echo ""

# Stop backend API server
if [ -f "$BACKEND_PID_FILE" ]; then
    BACKEND_PID=$(cat "$BACKEND_PID_FILE")
    if ps -p "$BACKEND_PID" > /dev/null 2>&1; then
        echo -e "${BLUE}   Stopping backend API (PID: $BACKEND_PID)...${NC}"
        kill "$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
        echo -e "${GREEN}✅ Backend API stopped${NC}"
    else
        echo -e "${YELLOW}⚠️  Backend API process not found (may have already stopped)${NC}"
    fi
    rm -f "$BACKEND_PID_FILE"
else
    echo -e "${GREEN}✅ Backend API not running${NC}"
fi

# Stop Docker services
echo ""
echo -e "${BLUE}🐳 Stopping Docker services...${NC}"
cd "$BACKEND_DIR"

if docker compose version &> /dev/null 2>&1; then
    docker compose down
else
    docker-compose down
fi

echo -e "${GREEN}✅ Docker services stopped${NC}"

# Ask about removing volumes
echo ""
read -p "Remove Docker volumes (this will delete all data)? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}🗑️  Removing Docker volumes...${NC}"
    cd "$BACKEND_DIR"
    if docker compose version &> /dev/null 2>&1; then
        docker compose down -v
    else
        docker-compose down -v
    fi
        echo -e "${GREEN}✅ Docker volumes removed${NC}"
    else
        echo -e "${GREEN}✅ Docker volumes preserved${NC}"
    fi
else
    echo -e "${GREEN}✅ Docker volumes preserved (restart mode)${NC}"
fi

# Summary
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ All services stopped${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "To start again:"
echo -e "  ${GREEN}./scripts/dev-start-backend.sh${NC}"
echo ""

