#!/bin/bash
# Prerequisites checker for deployment scripts

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0

# Function to check command exists
check_command() {
  local cmd=$1
  local required=$2
  local min_version=${3:-}

  if command -v "$cmd" >/dev/null 2>&1; then
    if [ -n "$min_version" ]; then
      local version
      version=$($cmd --version 2>/dev/null | head -n1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || echo "")
      if [ -z "$version" ]; then
        echo -e "${YELLOW}Warning: Could not determine $cmd version${NC}"
        return 0
      fi
      # Simple version comparison (basic check)
      echo -e "${GREEN}✓${NC} $cmd found (version: $version)"
    else
      echo -e "${GREEN}✓${NC} $cmd found"
    fi
    return 0
  else
    if [ "$required" = "true" ]; then
      echo -e "${RED}✗${NC} $cmd not found (required)"
      ERRORS=$((ERRORS + 1))
      return 1
    else
      echo -e "${YELLOW}⚠${NC} $cmd not found (optional)"
      return 0
    fi
  fi
}

# Function to check port availability
check_port() {
  local port=$1
  if command -v netstat >/dev/null 2>&1; then
    if netstat -tuln 2>/dev/null | grep -q ":$port "; then
      echo -e "${YELLOW}⚠${NC} Port $port is already in use"
      return 1
    fi
  elif command -v ss >/dev/null 2>&1; then
    if ss -tuln 2>/dev/null | grep -q ":$port "; then
      echo -e "${YELLOW}⚠${NC} Port $port is already in use"
      return 1
    fi
  else
    echo -e "${YELLOW}⚠${NC} Cannot check port $port (netstat/ss not available)"
  fi
  return 0
}

# Function to check disk space (minimum 5GB free)
check_disk_space() {
  local available_space
  if command -v df >/dev/null 2>&1; then
    available_space=$(df -BG . | tail -1 | awk '{print $4}' | sed 's/G//')
    if [ -n "$available_space" ] && [ "$available_space" -ge 5 ]; then
      echo -e "${GREEN}✓${NC} Sufficient disk space (${available_space}GB available)"
      return 0
    else
      echo -e "${YELLOW}⚠${NC} Low disk space (${available_space}GB available, 5GB recommended)"
      return 0
    fi
  fi
}

echo "Checking prerequisites..."
echo ""

# Check Bun
echo "Checking Bun..."
check_command "bun" "true" "1.3.5"
if command -v bun >/dev/null 2>&1; then
  BUN_VERSION=$(bun --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || echo "")
  if [ -n "$BUN_VERSION" ]; then
    # Basic version check (compare major.minor)
    REQUIRED_MAJOR=1
    REQUIRED_MINOR=3
    ACTUAL_MAJOR=$(echo "$BUN_VERSION" | cut -d. -f1)
    ACTUAL_MINOR=$(echo "$BUN_VERSION" | cut -d. -f2)
    if [ "$ACTUAL_MAJOR" -lt "$REQUIRED_MAJOR" ] || ([ "$ACTUAL_MAJOR" -eq "$REQUIRED_MAJOR" ] && [ "$ACTUAL_MINOR" -lt "$REQUIRED_MINOR" ]); then
      echo -e "${RED}✗${NC} Bun version $BUN_VERSION is too old (required: >= 1.3.5)"
      ERRORS=$((ERRORS + 1))
    fi
  fi
fi
echo ""

# Check Docker
echo "Checking Docker..."
check_command "docker" "true"
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Docker daemon is running"
  else
    echo -e "${RED}✗${NC} Docker daemon is not running"
    ERRORS=$((ERRORS + 1))
  fi
fi
echo ""

# Check Docker Compose
echo "Checking Docker Compose..."
if docker compose version >/dev/null 2>&1; then
  COMPOSE_VERSION=$(docker compose version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || echo "")
  echo -e "${GREEN}✓${NC} Docker Compose found (version: $COMPOSE_VERSION)"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_VERSION=$(docker-compose --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || echo "")
  echo -e "${GREEN}✓${NC} Docker Compose found (version: $COMPOSE_VERSION)"
else
  echo -e "${RED}✗${NC} Docker Compose not found (required)"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# Check required ports (warnings only, don't fail)
echo "Checking port availability..."
check_port 3000 || true
check_port 27017 || true
check_port 6379 || true
check_port 9000 || true
check_port 9001 || true
echo ""

# Check disk space
echo "Checking disk space..."
check_disk_space
echo ""

# Check network connectivity (basic check)
echo "Checking network connectivity..."
if ping -c 1 8.8.8.8 >/dev/null 2>&1 || ping -c 1 1.1.1.1 >/dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} Network connectivity OK"
else
  echo -e "${YELLOW}⚠${NC} Network connectivity check failed (may be fine if behind firewall)"
fi
echo ""

# Summary
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}All prerequisites met!${NC}"
  exit 0
else
  echo -e "${RED}Found $ERRORS error(s). Please fix the issues above.${NC}"
  exit 1
fi

