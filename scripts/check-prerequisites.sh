#!/bin/bash
# =====================================================
# Prerequisites Checker for AtlantisBoard Backend
# =====================================================
# Checks for required tools and versions
# =====================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ERRORS=0

echo -e "${BLUE}🔍 Checking prerequisites...${NC}"
echo ""

# Check Docker
echo -n "Checking Docker... "
if command -v docker &> /dev/null; then
    if docker ps &> /dev/null; then
        DOCKER_VERSION=$(docker --version | awk '{print $3}' | sed 's/,//')
        echo -e "${GREEN}✓${NC} Docker $DOCKER_VERSION (running)"
    else
        echo -e "${RED}✗${NC} Docker is installed but not running"
        echo -e "${YELLOW}   Please start Docker Desktop${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${RED}✗${NC} Docker not found"
    echo -e "${YELLOW}   Install from: https://www.docker.com/products/docker-desktop${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check Docker Compose
echo -n "Checking Docker Compose... "
if docker compose version &> /dev/null 2>&1; then
    COMPOSE_VERSION=$(docker compose version | awk '{print $4}')
    echo -e "${GREEN}✓${NC} Docker Compose $COMPOSE_VERSION"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_VERSION=$(docker-compose --version | awk '{print $3}' | sed 's/,//')
    echo -e "${GREEN}✓${NC} Docker Compose $COMPOSE_VERSION (legacy)"
else
    echo -e "${RED}✗${NC} Docker Compose not found"
    ERRORS=$((ERRORS + 1))
fi

# Check Node.js
echo -n "Checking Node.js... "
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | sed 's/v//')
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 20 ]; then
        echo -e "${GREEN}✓${NC} Node.js $NODE_VERSION"
    else
        echo -e "${YELLOW}⚠${NC} Node.js $NODE_VERSION (20+ recommended)"
    fi
else
    echo -e "${RED}✗${NC} Node.js not found"
    echo -e "${YELLOW}   Install Node.js 20+ from: https://nodejs.org/${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check npm
echo -n "Checking npm... "
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓${NC} npm $NPM_VERSION"
else
    echo -e "${RED}✗${NC} npm not found"
    ERRORS=$((ERRORS + 1))
fi

# Check openssl
echo -n "Checking openssl... "
if command -v openssl &> /dev/null; then
    echo -e "${GREEN}✓${NC} openssl available"
else
    echo -e "${YELLOW}⚠${NC} openssl not found (needed for JWT secret generation)"
    echo -e "${YELLOW}   JWT secrets will need to be generated manually${NC}"
fi

# Check curl (for health checks)
echo -n "Checking curl... "
if command -v curl &> /dev/null; then
    echo -e "${GREEN}✓${NC} curl available"
else
    echo -e "${YELLOW}⚠${NC} curl not found (needed for health checks)"
fi

echo ""

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All prerequisites met!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some prerequisites are missing. Please install them and try again.${NC}"
    exit 1
fi

