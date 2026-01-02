#!/bin/bash
# =====================================================
# AtlantisBoard Backend - Development Setup Script
# =====================================================
# One-time setup for local development environment
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

cd "$PROJECT_ROOT"

echo -e "${BLUE}🚀 AtlantisBoard Backend - Development Setup${NC}"
echo ""

# Check and install prerequisites automatically
echo -e "${BLUE}📋 Checking and installing prerequisites...${NC}"

MISSING_DEPS=()

# Check and install openssl
if ! command -v openssl &> /dev/null; then
    echo -e "${BLUE}📦 Installing openssl...${NC}"
    INSTALLED=false
    if command -v apt-get &> /dev/null; then
        if sudo apt-get update -qq && sudo apt-get install -y -qq openssl 2>/dev/null; then
            echo -e "${GREEN}✅ openssl installed${NC}"
            INSTALLED=true
        fi
    elif command -v yum &> /dev/null; then
        if sudo yum install -y -q openssl 2>/dev/null; then
            echo -e "${GREEN}✅ openssl installed${NC}"
            INSTALLED=true
        fi
    elif command -v brew &> /dev/null; then
        if brew install openssl 2>/dev/null; then
            echo -e "${GREEN}✅ openssl installed${NC}"
            INSTALLED=true
        fi
    fi
    if [ "$INSTALLED" = false ]; then
        echo -e "${YELLOW}⚠️  Could not auto-install openssl (may require sudo)${NC}"
        MISSING_DEPS+=("openssl")
    fi
fi

# Check and install curl
if ! command -v curl &> /dev/null; then
    echo -e "${BLUE}📦 Installing curl...${NC}"
    INSTALLED=false
    if command -v apt-get &> /dev/null; then
        if sudo apt-get update -qq && sudo apt-get install -y -qq curl 2>/dev/null; then
            echo -e "${GREEN}✅ curl installed${NC}"
            INSTALLED=true
        fi
    elif command -v yum &> /dev/null; then
        if sudo yum install -y -q curl 2>/dev/null; then
            echo -e "${GREEN}✅ curl installed${NC}"
            INSTALLED=true
        fi
    elif command -v brew &> /dev/null; then
        if brew install curl 2>/dev/null; then
            echo -e "${GREEN}✅ curl installed${NC}"
            INSTALLED=true
        fi
    fi
    if [ "$INSTALLED" = false ]; then
        echo -e "${YELLOW}⚠️  Could not auto-install curl (may require sudo)${NC}"
        MISSING_DEPS+=("curl")
    fi
fi

# Check Docker (cannot auto-install, requires user interaction)
if ! command -v docker &> /dev/null; then
    MISSING_DEPS+=("Docker (install from https://www.docker.com/products/docker-desktop)")
elif ! docker ps &> /dev/null; then
    echo -e "${YELLOW}⚠️  Docker is installed but not running${NC}"
    echo -e "${YELLOW}   Please start Docker Desktop${NC}"
    MISSING_DEPS+=("Docker (start Docker Desktop)")
fi

# Check Docker Compose
if ! docker compose version &> /dev/null 2>&1 && ! command -v docker-compose &> /dev/null; then
    MISSING_DEPS+=("Docker Compose (usually comes with Docker)")
fi

# Check Node.js (will be handled by nvm section below if missing)
if ! command -v node &> /dev/null; then
    MISSING_DEPS+=("Node.js (will attempt to install via nvm below)")
fi

# Check npm (usually comes with Node.js)
if ! command -v npm &> /dev/null; then
    if ! command -v node &> /dev/null; then
        MISSING_DEPS+=("npm (will be installed with Node.js)")
    else
        echo -e "${YELLOW}⚠️  npm not found but Node.js is installed${NC}"
        MISSING_DEPS+=("npm (should come with Node.js)")
    fi
fi

# Report critical missing dependencies (non-auto-installable)
if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    CRITICAL_MISSING=()
    for item in "${MISSING_DEPS[@]}"; do
        if [[ "$item" == *"Docker"* ]] || [[ "$item" == *"Node.js"* && "$item" != *"will attempt"* ]]; then
            CRITICAL_MISSING+=("$item")
        fi
    done
    
    if [ ${#CRITICAL_MISSING[@]} -gt 0 ]; then
        echo ""
        echo -e "${RED}❌ Critical prerequisites missing:${NC}"
        for item in "${CRITICAL_MISSING[@]}"; do
            echo -e "${YELLOW}   - $item${NC}"
        done
        echo ""
    fi
fi

echo ""

# Ensure correct Node.js version (from .nvmrc) or install if missing
if [ -f "$PROJECT_ROOT/.nvmrc" ]; then
    REQUIRED_NODE_VERSION=$(cat "$PROJECT_ROOT/.nvmrc" | tr -d '\n')
    echo -e "${BLUE}🔧 Ensuring Node.js version $REQUIRED_NODE_VERSION (from .nvmrc)...${NC}"
    
    # Try to source nvm if available
    if [ -s "$HOME/.nvm/nvm.sh" ]; then
        source "$HOME/.nvm/nvm.sh"
    elif [ -s "$HOME/.bashrc" ]; then
        source "$HOME/.bashrc" 2>/dev/null || true
    fi
    
    # Check if nvm is available
    if command -v nvm &> /dev/null || type nvm &> /dev/null; then
        CURRENT_NODE=$(node --version 2>/dev/null | sed 's/v//' || echo "")
        
        # If Node.js is not installed, install it
        if [ -z "$CURRENT_NODE" ]; then
            echo -e "${BLUE}📦 Node.js not found. Installing v$REQUIRED_NODE_VERSION via nvm...${NC}"
            if nvm install "$REQUIRED_NODE_VERSION" 2>/dev/null && nvm use "$REQUIRED_NODE_VERSION" 2>/dev/null; then
                echo -e "${GREEN}✅ Node.js v$REQUIRED_NODE_VERSION installed${NC}"
                CURRENT_NODE="$REQUIRED_NODE_VERSION"
            else
                echo -e "${RED}❌ Failed to install Node.js v$REQUIRED_NODE_VERSION${NC}"
                echo -e "${YELLOW}   Please install manually: nvm install $REQUIRED_NODE_VERSION${NC}"
                exit 1
            fi
        elif [ "$CURRENT_NODE" != "$REQUIRED_NODE_VERSION" ]; then
            echo -e "${YELLOW}⚠️  Current Node.js version: v$CURRENT_NODE${NC}"
            echo -e "${YELLOW}   Switching to Node.js v$REQUIRED_NODE_VERSION...${NC}"
            
            # Try to use nvm to switch versions
            if nvm use "$REQUIRED_NODE_VERSION" 2>/dev/null; then
                echo -e "${GREEN}✅ Switched to Node.js v$REQUIRED_NODE_VERSION${NC}"
            elif nvm install "$REQUIRED_NODE_VERSION" 2>/dev/null && nvm use "$REQUIRED_NODE_VERSION" 2>/dev/null; then
                echo -e "${GREEN}✅ Installed and switched to Node.js v$REQUIRED_NODE_VERSION${NC}"
            else
                echo -e "${YELLOW}⚠️  Could not switch Node.js version with nvm${NC}"
                echo -e "${YELLOW}   Please manually run: nvm use $REQUIRED_NODE_VERSION${NC}"
            fi
        else
            echo -e "${GREEN}✅ Using Node.js v$CURRENT_NODE (correct version)${NC}"
        fi
    else
        # nvm not available
        CURRENT_NODE=$(node --version 2>/dev/null | sed 's/v//' || echo "")
        if [ -z "$CURRENT_NODE" ]; then
            echo -e "${RED}❌ Node.js not installed and nvm is not available${NC}"
            echo -e "${YELLOW}   Please install Node.js v$REQUIRED_NODE_VERSION from: https://nodejs.org/${NC}"
            echo -e "${YELLOW}   Or install nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash${NC}"
            exit 1
        else
            # Check if current Node version matches
            NODE_MAJOR=$(echo "$CURRENT_NODE" | cut -d. -f1)
            REQUIRED_MAJOR=$(echo "$REQUIRED_NODE_VERSION" | cut -d. -f1)
            if [ "$NODE_MAJOR" != "$REQUIRED_MAJOR" ]; then
                echo -e "${YELLOW}⚠️  Node.js version mismatch${NC}"
                echo -e "${YELLOW}   Current: v$CURRENT_NODE, Required: v$REQUIRED_NODE_VERSION${NC}"
                echo -e "${YELLOW}   Please install Node.js v$REQUIRED_NODE_VERSION or use nvm${NC}"
            else
                echo -e "${GREEN}✅ Node.js v$CURRENT_NODE (major version matches)${NC}"
            fi
        fi
    fi
    
    # Verify final Node version
    FINAL_NODE=$(node --version 2>/dev/null | sed 's/v//' || echo "")
    FINAL_NPM=$(npm --version 2>/dev/null || echo "")
    if [ -n "$FINAL_NODE" ]; then
        echo -e "${BLUE}   Node.js: v$FINAL_NODE, npm: v$FINAL_NPM${NC}"
    else
        echo -e "${RED}❌ Node.js installation verification failed${NC}"
        exit 1
    fi
    echo ""
elif ! command -v node &> /dev/null; then
    # No .nvmrc file, but Node.js is missing - try to install via nvm
    echo -e "${BLUE}📦 Node.js not found. Attempting to install via nvm...${NC}"
    
    # Try to source nvm
    if [ -s "$HOME/.nvm/nvm.sh" ]; then
        source "$HOME/.nvm/nvm.sh"
    elif [ -s "$HOME/.bashrc" ]; then
        source "$HOME/.bashrc" 2>/dev/null || true
    fi
    
    if command -v nvm &> /dev/null || type nvm &> /dev/null; then
        if nvm install --lts 2>/dev/null && nvm use --lts 2>/dev/null; then
            echo -e "${GREEN}✅ Node.js LTS installed via nvm${NC}"
        else
            echo -e "${RED}❌ Failed to install Node.js via nvm${NC}"
            echo -e "${YELLOW}   Please install Node.js from: https://nodejs.org/${NC}"
            exit 1
        fi
    else
        echo -e "${RED}❌ Node.js not installed and nvm is not available${NC}"
        echo -e "${YELLOW}   Please install Node.js from: https://nodejs.org/${NC}"
        echo -e "${YELLOW}   Or install nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash${NC}"
        exit 1
    fi
    echo ""
fi

# Check if backend/.env exists
ENV_FILE="$BACKEND_DIR/.env"
ENV_EXAMPLE="$BACKEND_DIR/env.example.txt"

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚠️  backend/.env not found. Creating from template...${NC}"
    
    if [ ! -f "$ENV_EXAMPLE" ]; then
        echo -e "${RED}❌ Error: $ENV_EXAMPLE not found${NC}"
        exit 1
    fi
    
    # Copy example file
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo -e "${GREEN}✅ Created $ENV_FILE${NC}"
    
    # Generate JWT secrets if not present
    echo ""
    echo -e "${BLUE}🔐 Generating JWT secrets...${NC}"
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "")
    JWT_REFRESH_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "")
    
    if [ -z "$JWT_SECRET" ] || [ -z "$JWT_REFRESH_SECRET" ]; then
        echo -e "${YELLOW}⚠️  Could not generate secrets automatically${NC}"
        echo -e "${YELLOW}   Please edit $ENV_FILE and set JWT_SECRET and JWT_REFRESH_SECRET${NC}"
        echo -e "${YELLOW}   Generate with: openssl rand -hex 32${NC}"
    else
        # Update .env file with generated secrets
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" "$ENV_FILE"
            sed -i '' "s/JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET/" "$ENV_FILE"
        else
            # Linux
            sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" "$ENV_FILE"
            sed -i "s/JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET/" "$ENV_FILE"
        fi
        echo -e "${GREEN}✅ JWT secrets generated and added to .env${NC}"
    fi
    
    echo ""
    echo -e "${YELLOW}📝 Please review and update $ENV_FILE with your configuration:${NC}"
    echo -e "${YELLOW}   - Google OAuth credentials (optional)${NC}"
    echo -e "${YELLOW}   - MySQL encryption key (optional)${NC}"
    echo ""
    read -p "Press Enter to continue after reviewing .env file..."
else
    echo -e "${GREEN}✅ backend/.env already exists${NC}"
    
    # Check if JWT secrets are set
    source "$ENV_FILE" 2>/dev/null || true
    if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "your-jwt-secret-minimum-32-characters-long" ]; then
        echo -e "${YELLOW}⚠️  JWT_SECRET not set or using default value${NC}"
        JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "")
        if [ -n "$JWT_SECRET" ]; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" "$ENV_FILE"
            else
                sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" "$ENV_FILE"
            fi
            echo -e "${GREEN}✅ Generated and set JWT_SECRET${NC}"
        fi
    fi
    
    if [ -z "$JWT_REFRESH_SECRET" ] || [ "$JWT_REFRESH_SECRET" = "your-refresh-token-secret-minimum-32-characters-long" ]; then
        echo -e "${YELLOW}⚠️  JWT_REFRESH_SECRET not set or using default value${NC}"
        JWT_REFRESH_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "")
        if [ -n "$JWT_REFRESH_SECRET" ]; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s/JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET/" "$ENV_FILE"
            else
                sed -i "s/JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET/" "$ENV_FILE"
            fi
            echo -e "${GREEN}✅ Generated and set JWT_REFRESH_SECRET${NC}"
        fi
    fi
fi

# Install backend dependencies (idempotent)
echo ""
echo -e "${BLUE}📦 Checking backend dependencies...${NC}"
cd "$BACKEND_DIR"

# Check if dependencies need to be installed
NEEDS_INSTALL=false

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  node_modules directory not found${NC}"
    NEEDS_INSTALL=true
else
    # Check if Prisma is installed (critical dependency)
    if [ ! -f "node_modules/.bin/prisma" ] && [ ! -f "node_modules/@prisma/client/index.js" ]; then
        echo -e "${YELLOW}⚠️  Prisma not found in node_modules${NC}"
        NEEDS_INSTALL=true
    fi
    
    # Check if package-lock.json is newer than node_modules (indicates changes)
    if [ -f "package-lock.json" ] && [ -d "node_modules" ]; then
        if [ "package-lock.json" -nt "node_modules" ]; then
            echo -e "${YELLOW}⚠️  package-lock.json is newer than node_modules${NC}"
            NEEDS_INSTALL=true
        fi
    fi
    
    # Verify critical packages are installed
    if [ "$NEEDS_INSTALL" = false ]; then
        # Check critical packages (handle scoped packages)
        if [ ! -d "node_modules/@prisma/client" ] && [ ! -d "node_modules/@prisma" ]; then
            echo -e "${YELLOW}⚠️  Critical package '@prisma/client' not found${NC}"
            NEEDS_INSTALL=true
        elif [ ! -d "node_modules/prisma" ]; then
            echo -e "${YELLOW}⚠️  Critical package 'prisma' not found${NC}"
            NEEDS_INSTALL=true
        elif [ ! -d "node_modules/express" ]; then
            echo -e "${YELLOW}⚠️  Critical package 'express' not found${NC}"
            NEEDS_INSTALL=true
        elif [ ! -d "node_modules/typescript" ]; then
            echo -e "${YELLOW}⚠️  Critical package 'typescript' not found${NC}"
            NEEDS_INSTALL=true
        elif [ ! -d "node_modules/tsx" ]; then
            echo -e "${YELLOW}⚠️  Critical package 'tsx' not found${NC}"
            NEEDS_INSTALL=true
        fi
    fi
fi

if [ "$NEEDS_INSTALL" = true ]; then
    echo -e "${BLUE}📦 Installing backend dependencies...${NC}"
    npm install
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Backend dependencies installed${NC}"
    else
        echo -e "${RED}❌ Failed to install backend dependencies${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Backend dependencies are installed${NC}"
fi

# Note: Prisma client generation is handled by migrate-db.sh
# This ensures single source of truth and prevents duplicate generation

# Install frontend dependencies (idempotent)
echo ""
echo -e "${BLUE}📦 Checking frontend dependencies...${NC}"
cd "$PROJECT_ROOT"

# Check if dependencies need to be installed
NEEDS_INSTALL=false

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  node_modules directory not found${NC}"
    NEEDS_INSTALL=true
else
    # Check if package-lock.json is newer than node_modules
    if [ -f "package-lock.json" ] && [ -d "node_modules" ]; then
        if [ "package-lock.json" -nt "node_modules" ]; then
            echo -e "${YELLOW}⚠️  package-lock.json is newer than node_modules${NC}"
            NEEDS_INSTALL=true
        fi
    fi
    
    # Verify critical packages are installed
    if [ "$NEEDS_INSTALL" = false ]; then
        CRITICAL_PACKAGES=("react" "react-dom" "vite" "typescript")
        for pkg in "${CRITICAL_PACKAGES[@]}"; do
            if [ ! -d "node_modules/$pkg" ]; then
                echo -e "${YELLOW}⚠️  Critical package '$pkg' not found${NC}"
                NEEDS_INSTALL=true
                break
            fi
        done
    fi
fi

if [ "$NEEDS_INSTALL" = true ]; then
    echo -e "${BLUE}📦 Installing frontend dependencies...${NC}"
    npm install
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Frontend dependencies installed${NC}"
    else
        echo -e "${RED}❌ Failed to install frontend dependencies${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Frontend dependencies are installed${NC}"
fi

# Start Docker services
echo ""
echo -e "${BLUE}🐳 Starting Docker services (PostgreSQL, MinIO)...${NC}"
cd "$BACKEND_DIR"

# Load environment variables for docker-compose
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

# Wait for PostgreSQL to be healthy
echo ""
echo -e "${BLUE}⏳ Waiting for PostgreSQL to be ready...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0
POSTGRES_READY=false

# Get database name from env or use default
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
    sleep 2
done
echo ""

if [ "$POSTGRES_READY" = true ]; then
    echo -e "${GREEN}✅ PostgreSQL is ready${NC}"
else
    echo -e "${RED}❌ PostgreSQL did not become ready in time${NC}"
    echo -e "${YELLOW}   Check logs with: docker logs atlantisboard-postgres${NC}"
    exit 1
fi

# Wait for MinIO to be healthy
echo ""
echo -e "${BLUE}⏳ Waiting for MinIO to be ready...${NC}"
MAX_RETRIES=10
RETRY_COUNT=0
MINIO_READY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f http://localhost:9000/minio/health/live &> /dev/null 2>&1; then
        MINIO_READY=true
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -n "."
    sleep 3
done
echo ""

if [ "$MINIO_READY" = true ]; then
    echo -e "${GREEN}✅ MinIO is ready${NC}"
else
    echo -e "${YELLOW}⚠️  MinIO health check failed, but continuing...${NC}"
    echo -e "${YELLOW}   Check logs with: docker logs atlantisboard-minio${NC}"
fi

# Run database migrations (includes Prisma client generation)
echo ""
echo -e "${BLUE}📊 Running database migrations...${NC}"
cd "$BACKEND_DIR"
if [ -f "./scripts/migrate-db.sh" ]; then
    bash ./scripts/migrate-db.sh
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Database migrations completed${NC}"
    else
        echo -e "${RED}❌ Database migrations failed${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Migration script not found, running Prisma commands directly...${NC}"
    if [ ! -f "node_modules/.bin/prisma" ]; then
        echo -e "${RED}❌ Prisma CLI not found. Please run: npm install${NC}"
        exit 1
    fi
    npm run prisma:generate
    npm run prisma:migrate
fi

# Summary
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo -e "  1. Start all services:"
echo -e "     ${GREEN}./scripts/dev-start-backend.sh${NC}"
echo ""
echo -e "  2. Access the application:"
echo -e "     Frontend:    ${GREEN}http://127.0.0.1:8080${NC}"
echo -e "     Backend API: ${GREEN}http://127.0.0.1:3000${NC}"
echo -e "     MinIO Console: ${GREEN}http://127.0.0.1:9001${NC}"
echo -e "     (Login: minioadmin / minioadmin)"
echo ""
echo -e "  3. Stop services:"
echo -e "     ${GREEN}./scripts/dev-stop-backend.sh${NC}"
echo ""

