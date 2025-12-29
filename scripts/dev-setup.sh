#!/bin/bash
# =====================================================
# AtlantisBoard Local Development Setup Script
# =====================================================
# This script sets up the complete local development environment
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

cd "$PROJECT_ROOT"

echo -e "${BLUE}🚀 AtlantisBoard Local Development Setup${NC}"
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo -e "${YELLOW}⚠️  .env.local not found. Generating keys and creating template...${NC}"
    
    # Generate keys
    echo -e "${BLUE}📝 Generating JWT keys...${NC}"
    KEYS_OUTPUT=$(python3 scripts/generate-keys.py)
    
    # Extract keys from output
    JWT_SECRET=$(echo "$KEYS_OUTPUT" | grep "JWT_SECRET=" | cut -d'=' -f2)
    ANON_KEY=$(echo "$KEYS_OUTPUT" | grep "ANON_KEY=" | cut -d'=' -f2)
    SERVICE_ROLE_KEY=$(echo "$KEYS_OUTPUT" | grep "SERVICE_ROLE_KEY=" | cut -d'=' -f2)
    SECRET_KEY_BASE=$(echo "$KEYS_OUTPUT" | grep "SECRET_KEY_BASE=" | cut -d'=' -f2)
    
    # Create .env.local from template
    cat > .env.local <<EOF
# =====================================================
# AtlantisBoard Local Development Environment
# =====================================================
# Generated automatically - edit as needed
# =====================================================

# Supabase Local Configuration
SUPABASE_URL=http://localhost:8000
VITE_SUPABASE_URL=http://localhost:8000
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}
VITE_SUPABASE_PROJECT_ID=local

# Database Configuration
POSTGRES_PASSWORD=postgres
POSTGRES_DB=postgres
POSTGRES_PORT=5432

# JWT Configuration
JWT_SECRET=${JWT_SECRET}
JWT_EXP=3600

# API Keys
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}

# GoTrue Auth Configuration
SITE_URL=http://localhost:8080
API_EXTERNAL_URL=http://localhost:8000
ADDITIONAL_REDIRECT_URLS=http://localhost:8080/*,http://localhost:8080/

# Google OAuth Configuration
# IMPORTANT: Configure these in Google Cloud Console first!
# 1. Go to https://console.cloud.google.com
# 2. Create OAuth 2.0 Client ID (Web application)
# 3. Add Authorized JavaScript origins: http://localhost:8080, http://localhost:8000
# 4. Add Authorized redirect URIs: http://localhost:8000/auth/v1/callback, http://localhost:8080/
ENABLE_GOOGLE_AUTH=true
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/v1/callback

# Email Configuration
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
DISABLE_SIGNUP=false

# Realtime Configuration
SECRET_KEY_BASE=${SECRET_KEY_BASE}

# Kong API Gateway
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443
EOF
    
    echo -e "${GREEN}✅ Created .env.local${NC}"
    echo -e "${YELLOW}⚠️  Please add your Google OAuth credentials (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)${NC}"
    echo ""
else
    echo -e "${GREEN}✅ .env.local already exists${NC}"
    source .env.local
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running.${NC}"
    echo ""
    echo -e "${YELLOW}📋 Docker Setup Options:${NC}"
    echo ""
    echo -e "${BLUE}Option 1: Docker Desktop for Windows (Recommended for WSL)${NC}"
    echo "  1. Download from: https://www.docker.com/products/docker-desktop"
    echo "  2. Install Docker Desktop"
    echo "  3. Enable 'Use the WSL 2 based engine' in Settings → General"
    echo "  4. Enable integration with your WSL distro in Settings → Resources → WSL Integration"
    echo "  5. Restart WSL: wsl --shutdown (in PowerShell), then reopen terminal"
    echo ""
    echo -e "${BLUE}Option 2: Install Docker Engine in WSL${NC}"
    echo "  Run: ./scripts/install-docker-wsl.sh"
    echo ""
    echo -e "${BLUE}Check Docker status:${NC}"
    echo "  Run: ./scripts/check-docker.sh"
    echo ""
    exit 1
fi

# Check for Docker Compose (v2 preferred, fallback to v1)
if docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
    echo -e "${YELLOW}⚠️  Using legacy docker-compose. Consider upgrading to Docker Compose v2.${NC}"
else
    echo -e "${RED}❌ Docker Compose not found.${NC}"
    echo "  Install Docker Compose v2: sudo apt-get install docker-compose-plugin"
    echo "  Or use Docker Desktop which includes Compose v2"
    exit 1
fi

# Start Supabase services
echo -e "${BLUE}📦 Starting Supabase services...${NC}"
if [ -f supabase/docker/start-services.sh ]; then
    # Use the wrapper script that properly loads environment variables
    bash supabase/docker/start-services.sh
else
    # Fallback: try to load and start manually
    cd supabase/docker
    if [ -f ../../.env.local ]; then
        set -a
        source ../../.env.local
        set +a
    fi
    $DOCKER_COMPOSE_CMD -f docker-compose.supabase.yml up -d
fi

# Wait for services to be ready
echo -e "${BLUE}⏳ Waiting for services to be ready...${NC}"
sleep 15

# Check if PostgreSQL is ready
echo -e "${BLUE}🔍 Checking PostgreSQL connection...${NC}"
for i in {1..30}; do
    if PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" psql -h localhost -p "${POSTGRES_PORT:-5432}" -U postgres -d "${POSTGRES_DB:-postgres}" -c "SELECT 1" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PostgreSQL is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ PostgreSQL failed to start${NC}"
        exit 1
    fi
    sleep 2
done

# Apply database schema
echo -e "${BLUE}📊 Applying database schema...${NC}"
PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" psql -h localhost -p "${POSTGRES_PORT:-5432}" -U postgres -d "${POSTGRES_DB:-postgres}" -f ../db/schema.sql 2>&1 | grep -v "already exists" || true

# Apply migrations
echo -e "${BLUE}🔄 Applying migrations...${NC}"
MIGRATION_COUNT=0
for file in ../migrations/*.sql; do
    if [ -f "$file" ]; then
        PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" psql -h localhost -p "${POSTGRES_PORT:-5432}" -U postgres -d "${POSTGRES_DB:-postgres}" -f "$file" 2>&1 | grep -v "already exists" || true
        MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
    fi
done
echo -e "${GREEN}✅ Applied $MIGRATION_COUNT migrations${NC}"

# Apply seed data
echo -e "${BLUE}🌱 Seeding database...${NC}"
PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" psql -h localhost -p "${POSTGRES_PORT:-5432}" -U postgres -d "${POSTGRES_DB:-postgres}" -f ../seed.sql 2>&1 | grep -v "already exists" || true

# Setup storage buckets
echo -e "${BLUE}📁 Setting up storage buckets...${NC}"
PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" psql -h localhost -p "${POSTGRES_PORT:-5432}" -U postgres -d "${POSTGRES_DB:-postgres}" -f ../storage/buckets.sql 2>&1 | grep -v "already exists" || true

cd "$PROJECT_ROOT"

# Verify services
echo -e "${BLUE}🔍 Verifying services...${NC}"
sleep 5

# Check Supabase API
if curl -s http://localhost:8000/rest/v1/ > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Supabase API is running${NC}"
else
    echo -e "${YELLOW}⚠️  Supabase API may not be ready yet${NC}"
fi

# Check storage buckets
BUCKET_COUNT=$(PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" psql -h localhost -p "${POSTGRES_PORT:-5432}" -U postgres -d "${POSTGRES_DB:-postgres}" -t -c "SELECT COUNT(*) FROM storage.buckets" 2>/dev/null | tr -d ' ')
if [ "$BUCKET_COUNT" -ge 3 ]; then
    echo -e "${GREEN}✅ Storage buckets configured ($BUCKET_COUNT buckets)${NC}"
else
    echo -e "${YELLOW}⚠️  Storage buckets may not be fully configured${NC}"
fi

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo -e "${BLUE}📋 Next steps:${NC}"
echo -e "  1. Add Google OAuth credentials to .env.local (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)"
echo -e "  2. Configure Google Cloud Console with redirect URIs:"
echo -e "     - http://localhost:8000/auth/v1/callback"
echo -e "     - http://localhost:8080/"
echo -e "  3. Start the frontend: ${YELLOW}npm run dev${NC}"
echo ""
echo -e "${BLUE}🌐 Services:${NC}"
echo -e "  - Frontend: ${GREEN}http://localhost:8080${NC}"
echo -e "  - Supabase API: ${GREEN}http://localhost:8000${NC}"
echo -e "  - PostgreSQL: ${GREEN}localhost:${POSTGRES_PORT:-5432}${NC}"
echo ""

