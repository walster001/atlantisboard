#!/bin/bash
# =====================================================
# AtlantisBoard Backend - Restart Development Services
# =====================================================
# Restarts all development services
# =====================================================

set -e

# Colors for output
BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}🔄 Restarting AtlantisBoard Development Services${NC}"
echo ""

# Stop services
echo -e "${BLUE}Step 1: Stopping services...${NC}"
bash "$SCRIPT_DIR/dev-stop-backend.sh" --no-prompt || true

# Wait a moment for services to fully stop
echo ""
echo -e "${BLUE}⏳ Waiting for services to stop...${NC}"
sleep 3

# Start services
echo ""
echo -e "${BLUE}Step 2: Starting services...${NC}"
bash "$SCRIPT_DIR/dev-start-backend.sh"

