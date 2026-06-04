#!/bin/bash
# Environment setup helper

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_EXAMPLE="$PROJECT_ROOT/.env.example"
ENV_FILE="$PROJECT_ROOT/.env"

# Function to generate random secret
generate_secret() {
  local length=${1:-32}
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$length"
  elif command -v head >/dev/null 2>&1 && [ -c /dev/urandom ]; then
    head -c "$length" /dev/urandom | od -A n -t x1 | tr -d ' \n' | cut -c1-$((length * 2))
  else
    # Fallback: use date + random number
    date +%s | sha256sum | head -c "$length"
  fi
}

# Create .env.example if it doesn't exist
if [ ! -f "$ENV_EXAMPLE" ]; then
  echo -e "${BLUE}Creating .env.example template...${NC}"
  cat > "$ENV_EXAMPLE" << 'EOF'
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/kanboard

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# MinIO Configuration
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false

# JWT Configuration
JWT_SECRET=change-this-to-a-secure-random-string-in-production
JWT_EXPIRES_IN=7d

# Session Configuration
SESSION_SECRET=change-this-to-a-secure-random-string-in-production

# Encryption Key (for admin config)
ENCRYPTION_KEY=change-this-to-a-secure-random-string-in-production

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# External MySQL (Optional - for Google OAuth + External MySQL auth)
EXTERNAL_MYSQL_HOST=
EXTERNAL_MYSQL_PORT=3306
EXTERNAL_MYSQL_DATABASE=
EXTERNAL_MYSQL_USERNAME=
EXTERNAL_MYSQL_PASSWORD=

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
EOF
  echo -e "${GREEN}✓${NC} Created .env.example"
fi

# Copy .env.example to .env if .env doesn't exist
if [ ! -f "$ENV_FILE" ]; then
  echo -e "${BLUE}Creating .env file from .env.example...${NC}"
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo -e "${GREEN}✓${NC} Created .env file"
  
  # Generate secure secrets if they are still default values
  if grep -q "change-this-to-a-secure-random-string-in-production" "$ENV_FILE"; then
    echo -e "${YELLOW}Generating secure random secrets...${NC}"
    
    # Generate JWT_SECRET (32 bytes = 64 hex chars)
    JWT_SECRET=$(generate_secret 32)
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" "$ENV_FILE"
      sed -i '' "s|SESSION_SECRET=.*|SESSION_SECRET=$JWT_SECRET|" "$ENV_FILE"
      sed -i '' "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$JWT_SECRET|" "$ENV_FILE"
    else
      sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" "$ENV_FILE"
      sed -i "s|SESSION_SECRET=.*|SESSION_SECRET=$JWT_SECRET|" "$ENV_FILE"
      sed -i "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$JWT_SECRET|" "$ENV_FILE"
    fi
    
    echo -e "${GREEN}✓${NC} Generated secure secrets"
  fi
else
  echo -e "${BLUE}.env file already exists${NC}"
  
  # Check if critical secrets are set
  if grep -q "JWT_SECRET=change-this" "$ENV_FILE" || grep -q "JWT_SECRET=$" "$ENV_FILE"; then
    echo -e "${YELLOW}Warning: JWT_SECRET is not set or is using default value${NC}"
    read -p "Generate new JWT_SECRET? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      JWT_SECRET=$(generate_secret 32)
      if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" "$ENV_FILE"
      else
        sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" "$ENV_FILE"
      fi
      echo -e "${GREEN}✓${NC} Updated JWT_SECRET"
    fi
  fi
fi

# Validate required variables
echo -e "${BLUE}Validating environment variables...${NC}"
REQUIRED_VARS=("MONGODB_URI" "REDIS_HOST" "JWT_SECRET" "SESSION_SECRET")
MISSING_VARS=()

# Source .env file to check variables
set +u
# shellcheck disable=SC1090
source "$ENV_FILE" 2>/dev/null || true
set -u

for var in "${REQUIRED_VARS[@]}"; do
  var_value=$(grep "^${var}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || echo "")
  if [ -z "$var_value" ] || [ "$var_value" = "change-this-to-a-secure-random-string-in-production" ]; then
    MISSING_VARS+=("$var")
  fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo -e "${YELLOW}Warning: The following required variables are missing or invalid:${NC}"
  for var in "${MISSING_VARS[@]}"; do
    echo -e "  ${YELLOW}- $var${NC}"
  done
  echo -e "${YELLOW}Please update .env file before continuing${NC}"
  exit 1
fi

echo -e "${GREEN}✓${NC} Environment variables validated"
exit 0

