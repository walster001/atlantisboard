#!/bin/bash
# Database initialization script

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load environment variables
if [ -f "$PROJECT_ROOT/.env" ]; then
  set +u
  # shellcheck disable=SC1090
  source "$PROJECT_ROOT/.env"
  set -u
fi

# Wait for MongoDB to be ready first
echo -e "${BLUE}Waiting for MongoDB...${NC}"
"$SCRIPT_DIR/wait-for-services.sh" || {
  echo -e "${RED}MongoDB is not ready. Please start Docker services first.${NC}"
  exit 1
}

echo -e "${BLUE}Initializing database...${NC}"

# Check if MongoDB is accessible
if [ -z "${MONGODB_URI:-}" ]; then
  MONGODB_URI="mongodb://localhost:27017/kanboard"
fi

# Try to connect and initialize admin config
# This will be done by the application on startup, but we can verify connectivity
if docker exec kanboard-mongodb mongosh "$MONGODB_URI" --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} Database connection verified"
  
  # The actual AdminConfig initialization happens when the app starts
  # We just verify the connection is ready
  echo -e "${BLUE}Note: Admin configuration will be initialized automatically when the application starts${NC}"
  
  # Optional: Prompt to create initial admin user
  if [ "${CREATE_ADMIN:-false}" = "true" ]; then
    read -p "Would you like to create an initial admin user? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      read -p "Admin email: " ADMIN_EMAIL
      read -p "Admin username: " ADMIN_USERNAME
      read -sp "Admin password: " ADMIN_PASSWORD
      echo
      
      # This would need to be implemented as an API call or direct DB script
      echo -e "${YELLOW}Admin user creation should be done via the registration endpoint or admin panel${NC}"
    fi
  fi
  
  echo -e "${GREEN}✓${NC} Database initialization complete"
  exit 0
else
  echo -e "${RED}✗${NC} Failed to connect to database"
  exit 1
fi

