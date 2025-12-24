#!/bin/bash

# =====================================================
# AtlantisBoard Full Local Deployment Script
# Ubuntu Jammy | Supabase (Docker) + Edge Functions + Deno + Nginx + HTTPS
# Version: 2.0.0
# =====================================================
# 
# This script is IDEMPOTENT - safe to re-run multiple times
# 
# Requirements:
#   - Fresh Ubuntu 22.04 (Jammy) or compatible
#   - Root or sudo access
#   - At least 4GB RAM, 20GB disk space
#   - Domain name pointing to this server (for HTTPS)
#
# =====================================================

set -euo pipefail

# =====================================================
# CONFIGURATION & CONSTANTS
# =====================================================

readonly SCRIPT_VERSION="2.0.0"
readonly LOG_FILE="/var/log/atlantisboard_deploy.log"
readonly APP_DIR="${APP_DIR:-$HOME/atlantisboard}"
readonly REPO_URL="https://github.com/walster001/atlantisboard.git"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# =====================================================
# HELPER FUNCTIONS
# =====================================================

log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE" 2>/dev/null || echo -e "${timestamp} [${level}] ${message}"
}

info() { log "INFO" "${BLUE}$1${NC}"; }
success() { log "SUCCESS" "${GREEN}$1${NC}"; }
warn() { log "WARN" "${YELLOW}$1${NC}"; }
error() { log "ERROR" "${RED}$1${NC}"; }

step() {
    local step_num="$1"
    local step_name="$2"
    echo ""
    echo "======================================="
    echo -e "${BLUE}[STEP $step_num] $step_name${NC}"
    echo "======================================="
}

check_command() {
    if command -v "$1" &> /dev/null; then
        success "$1 is installed ($(command -v $1))"
        return 0
    else
        warn "$1 is not installed"
        return 1
    fi
}

wait_for_service() {
    local name="$1"
    local check_cmd="$2"
    local max_attempts="${3:-30}"
    local interval="${4:-5}"
    local attempt=1
    
    info "Waiting for $name to be ready..."
    while [ $attempt -le $max_attempts ]; do
        if eval "$check_cmd" > /dev/null 2>&1; then
            success "$name is ready!"
            return 0
        fi
        echo "  Attempt $attempt/$max_attempts - waiting ${interval}s..."
        sleep $interval
        attempt=$((attempt + 1))
    done
    
    error "$name did not become ready after $max_attempts attempts"
    return 1
}

base64url_encode() {
    openssl base64 -e -A | tr '+/' '-_' | tr -d '='
}

generate_jwt() {
    local payload="$1"
    local secret="$2"
    local header='{"alg":"HS256","typ":"JWT"}'
    local header_b64=$(echo -n "$header" | base64url_encode)
    local payload_b64=$(echo -n "$payload" | base64url_encode)
    local signature=$(echo -n "${header_b64}.${payload_b64}" | openssl dgst -sha256 -hmac "$secret" -binary | base64url_encode)
    echo "${header_b64}.${payload_b64}.${signature}"
}

# =====================================================
# MAIN DEPLOYMENT FLOW
# =====================================================

main() {
    echo "======================================="
    echo "AtlantisBoard Local Production Deployment v$SCRIPT_VERSION"
    echo "======================================="
    echo ""
    echo "This script will deploy AtlantisBoard with:"
    echo "  • Local Supabase (PostgreSQL, Auth, Storage, Realtime)"
    echo "  • Edge Functions (Deno runtime)"
    echo "  • Frontend (Vite/React build + Deno server)"
    echo "  • Nginx reverse proxy + HTTPS (Let's Encrypt)"
    echo "  • Google OAuth authentication"
    echo "  • External MySQL verification (optional)"
    echo "  • Auto-start on system reboot"
    echo ""
    echo "Log file: $LOG_FILE"
    echo "======================================="
    sleep 2
    
    # Ensure log directory exists
    sudo mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
    sudo touch "$LOG_FILE" 2>/dev/null || true
    sudo chmod 666 "$LOG_FILE" 2>/dev/null || true

    # =========================================
    # PHASE 1: SYSTEM PREPARATION
    # =========================================
    
    step "1" "Updating system and installing base packages"
    sudo apt update
    sudo apt upgrade -y
    sudo apt install -y \
        curl \
        git \
        unzip \
        build-essential \
        apt-transport-https \
        ca-certificates \
        gnupg \
        lsb-release \
        nginx \
        certbot \
        python3-certbot-nginx \
        postgresql-client \
        jq
    success "Base packages installed"
    
    # =========================================
    step "2" "Installing Docker"
    # =========================================
    
    if check_command docker; then
        info "Docker already installed, verifying..."
    else
        info "Installing Docker..."
        curl -fsSL https://get.docker.com | sudo sh
    fi
    
    # Ensure Docker service is running
    sudo systemctl enable docker
    sudo systemctl start docker
    
    # Add user to docker group
    if ! groups | grep -q docker; then
        sudo usermod -aG docker "$USER"
        warn "Added $USER to docker group. You may need to logout/login for this to take effect."
    fi
    
    # Verify Docker is functional
    if ! sudo docker info > /dev/null 2>&1; then
        error "Docker is not running correctly. Please check Docker installation."
        exit 1
    fi
    success "Docker is ready"
    
    # Install Docker Compose v2 (if not present)
    if ! docker compose version > /dev/null 2>&1; then
        info "Installing Docker Compose plugin..."
        sudo apt install -y docker-compose-plugin || {
            # Fallback to standalone docker-compose
            sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
            sudo chmod +x /usr/local/bin/docker-compose
        }
    fi
    success "Docker Compose ready"
    
    # =========================================
    step "3" "Installing Node.js 20 LTS"
    # =========================================
    
    if check_command node; then
        NODE_VERSION=$(node -v)
        info "Node.js $NODE_VERSION already installed"
    else
        info "Installing Node.js 20.x..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt install -y nodejs
    fi
    success "Node.js $(node -v) ready"
    
    # =========================================
    step "4" "Installing Deno"
    # =========================================
    
    if check_command deno; then
        info "Deno already installed: $(deno --version | head -1)"
    else
        info "Installing Deno..."
        curl -fsSL https://deno.land/install.sh | sh
    fi
    
    # Ensure Deno is in PATH
    export DENO_INSTALL="$HOME/.deno"
    export PATH="$DENO_INSTALL/bin:$PATH"
    
    # Add to bashrc if not present
    if ! grep -q 'DENO_INSTALL' ~/.bashrc 2>/dev/null; then
        echo 'export DENO_INSTALL="$HOME/.deno"' >> ~/.bashrc
        echo 'export PATH="$DENO_INSTALL/bin:$PATH"' >> ~/.bashrc
    fi
    success "Deno ready"
    
    # =========================================
    step "5" "Cloning/Updating AtlantisBoard repository"
    # =========================================
    
    if [ -d "$APP_DIR" ]; then
        info "Repository exists, pulling latest changes..."
        cd "$APP_DIR"
        git fetch origin
        git reset --hard origin/main || git reset --hard origin/master || warn "Could not reset to origin"
    else
        info "Cloning repository..."
        git clone "$REPO_URL" "$APP_DIR"
        cd "$APP_DIR"
    fi
    success "Repository ready at $APP_DIR"
    
    # =========================================
    step "6" "Collecting configuration variables"
    # =========================================
    
    # Load existing .env if present
    if [ -f "$APP_DIR/.env" ]; then
        info "Found existing .env, loading values as defaults..."
        source "$APP_DIR/.env" 2>/dev/null || true
    fi
    
    echo ""
    echo "Please provide the following configuration values:"
    echo "(Press Enter to accept default values shown in brackets)"
    echo ""
    
    # Domain configuration
    read -p "Domain name (e.g., atlantisboard.example.com): " INPUT_DOMAIN
    DOMAIN="${INPUT_DOMAIN:-${APP_DOMAIN:-localhost}}"
    
    read -p "Public HTTP port [80]: " INPUT_HTTP_PORT
    NGINX_HTTP_PORT="${INPUT_HTTP_PORT:-${NGINX_HTTP_PORT:-80}}"
    
    read -p "Public HTTPS port [443]: " INPUT_HTTPS_PORT
    NGINX_HTTPS_PORT="${INPUT_HTTPS_PORT:-${NGINX_HTTPS_PORT:-443}}"
    
    read -p "Enable HTTPS via Certbot? (yes/no) [yes]: " INPUT_SSL
    ENABLE_SSL="${INPUT_SSL:-yes}"
    
    if [ "$ENABLE_SSL" = "yes" ]; then
        read -p "Certbot email address: " INPUT_EMAIL
        CERTBOT_EMAIL="${INPUT_EMAIL:-${CERTBOT_EMAIL:-admin@$DOMAIN}}"
    fi
    
    echo ""
    echo "--- Google OAuth Configuration ---"
    read -p "Google OAuth Client ID: " INPUT_GOOGLE_ID
    GOOGLE_CLIENT_ID="${INPUT_GOOGLE_ID:-${GOOGLE_CLIENT_ID:-}}"
    
    read -p "Google OAuth Client Secret: " INPUT_GOOGLE_SECRET
    GOOGLE_CLIENT_SECRET="${INPUT_GOOGLE_SECRET:-${GOOGLE_CLIENT_SECRET:-}}"
    
    GOOGLE_REDIRECT_URI="https://$DOMAIN/auth/callback"
    
    echo ""
    echo "--- External MySQL Configuration (Optional) ---"
    read -p "MySQL Host [skip]: " INPUT_MYSQL_HOST
    MYSQL_HOST="${INPUT_MYSQL_HOST:-${EXTERNAL_MYSQL_HOST:-}}"
    
    if [ -n "$MYSQL_HOST" ]; then
        read -p "MySQL Port [3306]: " INPUT_MYSQL_PORT
        MYSQL_PORT="${INPUT_MYSQL_PORT:-${EXTERNAL_MYSQL_PORT:-3306}}"
        
        read -p "MySQL User: " INPUT_MYSQL_USER
        MYSQL_USER="${INPUT_MYSQL_USER:-${EXTERNAL_MYSQL_USER:-}}"
        
        read -p "MySQL Password: " INPUT_MYSQL_PASSWORD
        MYSQL_PASSWORD="${INPUT_MYSQL_PASSWORD:-${EXTERNAL_MYSQL_PASSWORD:-}}"
        
        read -p "MySQL Database: " INPUT_MYSQL_DB
        MYSQL_DB="${INPUT_MYSQL_DB:-${EXTERNAL_MYSQL_DATABASE:-}}"
    fi
    
    success "Configuration collected"
    
    # =========================================
    step "7" "Generating JWT keys"
    # =========================================
    
    # Generate new keys or use existing
    if [ -n "${JWT_SECRET:-}" ]; then
        info "Using existing JWT_SECRET"
    else
        info "Generating new JWT secret..."
        JWT_SECRET=$(openssl rand -base64 32)
    fi
    
    # Generate timestamps
    IAT=$(date +%s)
    EXP=$((IAT + 315360000))  # 10 years
    
    # Generate anon key
    ANON_PAYLOAD="{\"role\":\"anon\",\"iss\":\"supabase\",\"iat\":$IAT,\"exp\":$EXP}"
    SUPABASE_ANON_KEY=$(generate_jwt "$ANON_PAYLOAD" "$JWT_SECRET")
    
    # Generate service_role key
    SERVICE_PAYLOAD="{\"role\":\"service_role\",\"iss\":\"supabase\",\"iat\":$IAT,\"exp\":$EXP}"
    SUPABASE_SERVICE_KEY=$(generate_jwt "$SERVICE_PAYLOAD" "$JWT_SECRET")
    
    # Generate secret key base for Realtime
    SECRET_KEY_BASE=$(openssl rand -base64 48)
    
    success "JWT keys generated"
    info "Anon Key: ${SUPABASE_ANON_KEY:0:40}..."
    info "Service Key: ${SUPABASE_SERVICE_KEY:0:40}..."
    
    # =========================================
    step "8" "Creating Supabase Docker configuration"
    # =========================================
    
    SUPABASE_DOCKER_DIR="$APP_DIR/supabase/docker"
    mkdir -p "$SUPABASE_DOCKER_DIR/volumes/kong"
    mkdir -p "$SUPABASE_DOCKER_DIR/volumes/db/init"
    
    # Create Supabase .env file
    cat > "$SUPABASE_DOCKER_DIR/.env" <<EOL
# Supabase Docker Configuration
# Generated by atlantisboard_local_deploy.sh v$SCRIPT_VERSION
# Generated at: $(date)

# Database
POSTGRES_PASSWORD=postgres
POSTGRES_DB=postgres
POSTGRES_PORT=5432

# JWT Configuration
JWT_SECRET=$JWT_SECRET
JWT_EXP=3600

# API Keys
ANON_KEY=$SUPABASE_ANON_KEY
SERVICE_ROLE_KEY=$SUPABASE_SERVICE_KEY

# URLs
API_EXTERNAL_URL=https://$DOMAIN
SITE_URL=https://$DOMAIN
ADDITIONAL_REDIRECT_URLS=https://$DOMAIN/*,https://$DOMAIN/auth/callback

# Google OAuth
ENABLE_GOOGLE_AUTH=true
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=$GOOGLE_REDIRECT_URI

# Ports (internal)
KONG_HTTP_PORT=54321
KONG_HTTPS_PORT=54322

# Security
SECRET_KEY_BASE=$SECRET_KEY_BASE

# Auth Settings
DISABLE_SIGNUP=false
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
EOL
    
    success "Supabase Docker environment created"
    
    # =========================================
    step "9" "Starting Supabase Docker services"
    # =========================================
    
    cd "$SUPABASE_DOCKER_DIR"
    
    # Stop existing services if running
    info "Stopping any existing Supabase services..."
    sudo docker compose -f docker-compose.supabase.yml down 2>/dev/null || true
    
    # Pull images
    info "Pulling Supabase Docker images (this may take several minutes on first run)..."
    sudo docker compose -f docker-compose.supabase.yml pull
    
    # Start services
    info "Starting Supabase services..."
    sudo docker compose -f docker-compose.supabase.yml up -d
    
    success "Supabase Docker services started"
    
    # =========================================
    step "10" "Waiting for Supabase services to be ready"
    # =========================================
    
    cd "$APP_DIR"
    
    # Wait for PostgreSQL
    wait_for_service "PostgreSQL" \
        "PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -c 'SELECT 1'" \
        60 5
    
    # Check for auth schema (created by supabase/postgres image)
    info "Verifying auth schema exists..."
    AUTH_EXISTS=$(PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -tAc \
        "SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth')")
    
    if [ "$AUTH_EXISTS" = "t" ]; then
        success "auth schema exists (created by Supabase)"
    else
        warn "auth schema not found - Supabase may not have initialized correctly"
        info "Waiting additional 30 seconds for Supabase initialization..."
        sleep 30
    fi
    
    # Check for storage schema
    info "Verifying storage schema exists..."
    STORAGE_EXISTS=$(PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -tAc \
        "SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage')")
    
    if [ "$STORAGE_EXISTS" = "t" ]; then
        success "storage schema exists (created by Supabase)"
    else
        warn "storage schema not found - Storage service may not be ready yet"
        info "Waiting for storage service..."
        sleep 20
    fi
    
    # Wait for Kong API Gateway
    wait_for_service "Kong API Gateway" \
        "curl -sf http://localhost:54321/rest/v1/ -H 'apikey: $SUPABASE_ANON_KEY'" \
        30 5
    
    # Wait for Auth service
    wait_for_service "GoTrue Auth" \
        "curl -sf http://localhost:54321/auth/v1/health" \
        30 5
    
    success "All Supabase services are ready"
    
    # =========================================
    step "11" "Importing database schema"
    # =========================================
    
    SCHEMA_FILE="$APP_DIR/supabase/db/schema.sql"
    
    if [ -f "$SCHEMA_FILE" ]; then
        info "Applying schema from $SCHEMA_FILE..."
        
        # Check if tables already exist
        TABLES_EXIST=$(PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -tAc \
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles')")
        
        if [ "$TABLES_EXIST" = "t" ]; then
            warn "Schema tables already exist. Skipping schema import to avoid duplicates."
            info "If you need to re-import, drop the tables first or use a migration tool."
        else
            PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -f "$SCHEMA_FILE" 2>&1 | while read line; do
                echo "  $line"
            done
            
            if [ ${PIPESTATUS[0]} -eq 0 ]; then
                success "Schema imported successfully"
            else
                error "Schema import had errors. Check output above."
            fi
        fi
    else
        error "Schema file not found: $SCHEMA_FILE"
        exit 1
    fi
    
    # =========================================
    step "12" "Applying seed data"
    # =========================================
    
    SEED_FILE="$APP_DIR/supabase/seed.sql"
    
    if [ -f "$SEED_FILE" ]; then
        info "Applying seed data from $SEED_FILE..."
        
        PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -f "$SEED_FILE" 2>&1 | while read line; do
            echo "  $line"
        done
        
        success "Seed data applied"
    else
        warn "Seed file not found: $SEED_FILE (skipping)"
    fi
    
    # =========================================
    step "13" "Configuring storage buckets"
    # =========================================
    
    STORAGE_FILE="$APP_DIR/supabase/storage/buckets.sql"
    
    if [ -f "$STORAGE_FILE" ]; then
        # Wait a bit more for storage to be fully initialized
        info "Ensuring storage service is fully initialized..."
        sleep 10
        
        # Check if storage.buckets table exists
        STORAGE_TABLE=$(PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -tAc \
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets')")
        
        if [ "$STORAGE_TABLE" = "t" ]; then
            info "Applying storage configuration from $STORAGE_FILE..."
            
            PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -f "$STORAGE_FILE" 2>&1 | while read line; do
                echo "  $line"
            done
            
            success "Storage buckets configured"
        else
            warn "storage.buckets table not found. Storage service may not be ready."
            warn "You may need to run this manually later:"
            warn "  PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -f $STORAGE_FILE"
        fi
    else
        warn "Storage config file not found: $STORAGE_FILE (skipping)"
    fi
    
    # =========================================
    step "14" "Verifying Edge Functions"
    # =========================================
    
    EDGE_FUNCS_DIR="$APP_DIR/supabase/functions"
    
    if [ -d "$EDGE_FUNCS_DIR" ]; then
        info "Edge Functions directory found: $EDGE_FUNCS_DIR"
        info "Functions available:"
        
        for func in "$EDGE_FUNCS_DIR"/*/; do
            if [ -d "$func" ]; then
                FUNC_NAME=$(basename "$func")
                if [ -f "$func/index.ts" ]; then
                    success "  • $FUNC_NAME (index.ts found)"
                else
                    warn "  • $FUNC_NAME (WARNING: no index.ts)"
                fi
            fi
        done
        
        info "Edge Functions will be served via Supabase Edge Runtime at:"
        info "  http://localhost:54321/functions/v1/<function-name>"
    else
        warn "No Edge Functions directory found at $EDGE_FUNCS_DIR"
    fi
    
    # =========================================
    step "15" "Creating unified app .env file"
    # =========================================
    
    cat > "$APP_DIR/.env" <<EOL
# ================================================
# AtlantisBoard Configuration
# Generated by atlantisboard_local_deploy.sh v$SCRIPT_VERSION
# Generated at: $(date)
# ================================================

# --------------------------
# Core App
# --------------------------
APP_DOMAIN=$DOMAIN
NGINX_HTTP_PORT=$NGINX_HTTP_PORT
NGINX_HTTPS_PORT=$NGINX_HTTPS_PORT
ENABLE_SSL=$ENABLE_SSL
CERTBOT_EMAIL=${CERTBOT_EMAIL:-}

# --------------------------
# Supabase Configuration
# --------------------------
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_KEY
SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:5432/postgres

# --------------------------
# Frontend Variables (Vite)
# --------------------------
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_PUBLISHABLE_KEY=$SUPABASE_ANON_KEY
VITE_SUPABASE_PROJECT_ID=local

# --------------------------
# Google OAuth
# --------------------------
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOTRUE_EXTERNAL_GOOGLE_SECRET=$GOOGLE_CLIENT_SECRET
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=$GOOGLE_REDIRECT_URI
GOTRUE_SITE_URL=https://$DOMAIN
GOTRUE_URI_ALLOW_LIST=https://$DOMAIN/*

# --------------------------
# External MySQL (if configured)
# --------------------------
EXTERNAL_MYSQL_HOST=${MYSQL_HOST:-}
EXTERNAL_MYSQL_PORT=${MYSQL_PORT:-3306}
EXTERNAL_MYSQL_USER=${MYSQL_USER:-}
EXTERNAL_MYSQL_PASSWORD=${MYSQL_PASSWORD:-}
EXTERNAL_MYSQL_DATABASE=${MYSQL_DB:-}

# --------------------------
# JWT (reference)
# --------------------------
JWT_SECRET=$JWT_SECRET
EOL
    
    success "Unified .env file created"
    
    # Create .env.local for Vite
    cat > "$APP_DIR/.env.local" <<EOL
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_PUBLISHABLE_KEY=$SUPABASE_ANON_KEY
VITE_SUPABASE_PROJECT_ID=local
EOL
    
    success "Frontend .env.local created"
    
    # =========================================
    step "16" "Installing frontend dependencies"
    # =========================================
    
    cd "$APP_DIR"
    
    info "Installing npm packages..."
    info "Note: Using --legacy-peer-deps to resolve React 18 / @toast-ui/react-editor compatibility"
    
    # Use legacy peer deps to resolve the React 18 peer dependency issue with @toast-ui/react-editor
    npm install --legacy-peer-deps 2>&1 | tail -20
    
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        success "npm packages installed successfully"
    else
        warn "npm install had warnings, attempting alternative approach..."
        npm install --force 2>&1 | tail -20
    fi
    
    # =========================================
    step "17" "Building frontend"
    # =========================================
    
    info "Running Vite build..."
    npm run build 2>&1 | tail -30
    
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        success "Frontend build completed"
    else
        error "Frontend build failed. Check the output above."
        exit 1
    fi
    
    # Move build to frontend directory
    mkdir -p "$APP_DIR/frontend"
    rm -rf "$APP_DIR/frontend/dist" 2>/dev/null || true
    mv "$APP_DIR/dist" "$APP_DIR/frontend/"
    
    success "Frontend built and moved to frontend/dist"
    
    # =========================================
    step "18" "Setting up Deno server"
    # =========================================
    
    mkdir -p "$APP_DIR/server"
    
    cat > "$APP_DIR/server/server.ts" <<'EOF'
// AtlantisBoard Deno Static File Server
// Serves the frontend build with SPA fallback

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const PORT = parseInt(Deno.env.get("PORT") || "8000");
const FRONTEND_DIR = "./frontend/dist";

// MIME types
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

function getContentType(path: string): string {
  const ext = path.substring(path.lastIndexOf("."));
  return MIME_TYPES[ext] || "application/octet-stream";
}

async function serveFile(path: string): Promise<Response | null> {
  try {
    const data = await Deno.readFile(path);
    return new Response(data, {
      headers: { "content-type": getContentType(path) },
    });
  } catch {
    return null;
  }
}

console.log(`AtlantisBoard Deno server starting on port ${PORT}...`);

serve(async (req) => {
  const url = new URL(req.url);
  let path = url.pathname;
  
  // Serve static files
  const filePath = `${FRONTEND_DIR}${path === "/" ? "/index.html" : path}`;
  const response = await serveFile(filePath);
  
  if (response) {
    return response;
  }
  
  // SPA fallback - serve index.html for client-side routing
  const indexResponse = await serveFile(`${FRONTEND_DIR}/index.html`);
  if (indexResponse) {
    return indexResponse;
  }
  
  return new Response("Not Found", { status: 404 });
}, { port: PORT });
EOF
    
    success "Deno server script created"
    
    # =========================================
    step "19" "Creating Docker Compose for frontend"
    # =========================================
    
    cat > "$APP_DIR/docker-compose.yml" <<'EOF'
version: '3.9'

services:
  deno:
    image: denoland/deno:alpine
    container_name: atlantis-deno
    restart: unless-stopped
    working_dir: /app
    volumes:
      - .:/app:ro
    env_file:
      - .env
    environment:
      - PORT=8000
    command: deno run --allow-net --allow-read --allow-env server/server.ts
    ports:
      - "8000:8000"
    networks:
      - atlantis-net
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8000/"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  atlantis-net:
    driver: bridge
EOF
    
    success "Frontend Docker Compose configuration created"
    
    # Start frontend container
    info "Starting frontend container..."
    cd "$APP_DIR"
    sudo docker compose up -d
    
    wait_for_service "Deno frontend" \
        "curl -sf http://localhost:8000/" \
        30 5
    
    success "Frontend container started"
    
    # =========================================
    step "20" "Configuring Nginx"
    # =========================================
    
    NGINX_CONF="/etc/nginx/sites-available/atlantisboard"
    NGINX_ENABLED="/etc/nginx/sites-enabled/atlantisboard"
    
    # Remove default nginx config if exists
    sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    
    sudo tee "$NGINX_CONF" > /dev/null <<EOL
# AtlantisBoard Nginx Configuration
# Generated by atlantisboard_local_deploy.sh

upstream frontend {
    server 127.0.0.1:8000;
}

upstream supabase {
    server 127.0.0.1:54321;
}

server {
    listen ${NGINX_HTTP_PORT};
    server_name ${DOMAIN};
    
    # Logging
    access_log /var/log/nginx/atlantisboard_access.log;
    error_log /var/log/nginx/atlantisboard_error.log;

    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # Supabase REST API
    location /rest/ {
        proxy_pass http://supabase/rest/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Supabase Auth
    location /auth/ {
        proxy_pass http://supabase/auth/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Supabase Storage
    location /storage/ {
        proxy_pass http://supabase/storage/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 50M;
    }
    
    # Supabase Edge Functions
    location /functions/ {
        proxy_pass http://supabase/functions/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Supabase Realtime (WebSocket)
    location /realtime/ {
        proxy_pass http://supabase/realtime/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOL
    
    # Enable site
    sudo ln -sf "$NGINX_CONF" "$NGINX_ENABLED"
    
    # Test nginx config
    if sudo nginx -t; then
        success "Nginx configuration is valid"
    else
        error "Nginx configuration test failed"
        exit 1
    fi
    
    sudo systemctl reload nginx
    success "Nginx configured and reloaded"
    
    # =========================================
    step "21" "Setting up HTTPS (if enabled)"
    # =========================================
    
    if [ "$ENABLE_SSL" = "yes" ]; then
        info "Requesting SSL certificate from Let's Encrypt..."
        
        # Check if domain resolves
        if getent hosts "$DOMAIN" > /dev/null 2>&1; then
            sudo certbot --nginx -d "$DOMAIN" \
                --non-interactive \
                --agree-tos \
                -m "$CERTBOT_EMAIL" \
                --redirect || {
                    warn "Certbot failed. HTTPS setup incomplete."
                    warn "You can try again manually: sudo certbot --nginx -d $DOMAIN"
                }
            
            # Setup auto-renewal cron
            echo "0 3 * * * root certbot renew --quiet && systemctl reload nginx" | sudo tee /etc/cron.d/certbot-renew
            
            success "HTTPS configured with auto-renewal"
        else
            warn "Domain $DOMAIN does not resolve. Skipping HTTPS setup."
            warn "Configure DNS, then run: sudo certbot --nginx -d $DOMAIN"
        fi
    else
        info "HTTPS disabled, running HTTP only"
    fi
    
    # =========================================
    step "22" "Creating systemd services"
    # =========================================
    
    # Main AtlantisBoard service
    sudo tee /etc/systemd/system/atlantisboard.service > /dev/null <<EOL
[Unit]
Description=AtlantisBoard Application (Frontend + Supabase)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR

# Start Supabase first
ExecStart=/usr/bin/docker compose -f $SUPABASE_DOCKER_DIR/docker-compose.supabase.yml up -d
# Then start frontend
ExecStart=/usr/bin/docker compose -f $APP_DIR/docker-compose.yml up -d

# Stop in reverse order
ExecStop=/usr/bin/docker compose -f $APP_DIR/docker-compose.yml down
ExecStop=/usr/bin/docker compose -f $SUPABASE_DOCKER_DIR/docker-compose.supabase.yml down

[Install]
WantedBy=multi-user.target
EOL
    
    sudo systemctl daemon-reload
    sudo systemctl enable atlantisboard
    sudo systemctl enable nginx
    
    success "Systemd services configured"
    
    # =========================================
    step "23" "Creating helper scripts"
    # =========================================
    
    # Start script
    cat > "$APP_DIR/start.sh" <<'SCRIPT'
#!/bin/bash
set -e
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Starting AtlantisBoard services..."
cd "$APP_DIR/supabase/docker" && docker compose -f docker-compose.supabase.yml up -d
cd "$APP_DIR" && docker compose up -d
echo ""
echo "Services started!"
echo "  Frontend: http://localhost:8000"
echo "  Supabase API: http://localhost:54321"
SCRIPT
    chmod +x "$APP_DIR/start.sh"
    
    # Stop script
    cat > "$APP_DIR/stop.sh" <<'SCRIPT'
#!/bin/bash
set -e
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Stopping AtlantisBoard services..."
cd "$APP_DIR" && docker compose down
cd "$APP_DIR/supabase/docker" && docker compose -f docker-compose.supabase.yml down
echo "All services stopped."
SCRIPT
    chmod +x "$APP_DIR/stop.sh"
    
    # Update script
    cat > "$APP_DIR/update.sh" <<'SCRIPT'
#!/bin/bash
set -e
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"
echo "Updating AtlantisBoard..."
git pull
npm install --legacy-peer-deps
npm run build
rm -rf frontend/dist
mv dist frontend/
docker compose restart
echo "Update complete!"
SCRIPT
    chmod +x "$APP_DIR/update.sh"
    
    # Backup script
    cat > "$APP_DIR/backup.sh" <<'SCRIPT'
#!/bin/bash
set -e
BACKUP_DIR="${HOME}/atlantisboard_backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/db_$TIMESTAMP.sql"
echo "Creating database backup..."
PGPASSWORD=postgres pg_dump -h localhost -p 5432 -U postgres postgres > "$BACKUP_FILE"
echo "Backup saved to: $BACKUP_FILE"
SCRIPT
    chmod +x "$APP_DIR/backup.sh"
    
    # Restore script
    cat > "$APP_DIR/restore.sh" <<'SCRIPT'
#!/bin/bash
set -e
if [ -z "$1" ]; then
    echo "Usage: ./restore.sh <backup.sql>"
    exit 1
fi
echo "Restoring database from: $1"
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres postgres < "$1"
echo "Database restored."
SCRIPT
    chmod +x "$APP_DIR/restore.sh"
    
    # Status script
    cat > "$APP_DIR/status.sh" <<'SCRIPT'
#!/bin/bash
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "=== AtlantisBoard Status ==="
echo ""
echo "Docker Containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "(supabase|atlantis|NAMES)"
echo ""
echo "Service Health:"
echo -n "  PostgreSQL: "
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -c "SELECT 1" > /dev/null 2>&1 && echo "✓ OK" || echo "✗ Down"
echo -n "  Supabase API: "
curl -sf http://localhost:54321/rest/v1/ > /dev/null 2>&1 && echo "✓ OK" || echo "✗ Down"
echo -n "  Frontend: "
curl -sf http://localhost:8000/ > /dev/null 2>&1 && echo "✓ OK" || echo "✗ Down"
SCRIPT
    chmod +x "$APP_DIR/status.sh"
    
    # Logs script
    cat > "$APP_DIR/logs.sh" <<'SCRIPT'
#!/bin/bash
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
case "${1:-all}" in
    supabase)
        cd "$APP_DIR/supabase/docker" && docker compose -f docker-compose.supabase.yml logs -f
        ;;
    frontend)
        cd "$APP_DIR" && docker compose logs -f
        ;;
    all)
        echo "Showing combined logs (Ctrl+C to exit)..."
        cd "$APP_DIR/supabase/docker" && docker compose -f docker-compose.supabase.yml logs -f &
        cd "$APP_DIR" && docker compose logs -f &
        wait
        ;;
    *)
        echo "Usage: ./logs.sh [supabase|frontend|all]"
        ;;
esac
SCRIPT
    chmod +x "$APP_DIR/logs.sh"
    
    success "Helper scripts created"
    
    # =========================================
    step "24" "Final health checks"
    # =========================================
    
    echo ""
    info "Running final health checks..."
    
    # Check PostgreSQL
    echo -n "  PostgreSQL: "
    if PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -c "SELECT 1" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
    else
        echo -e "${RED}✗ Failed${NC}"
    fi
    
    # Check Supabase API
    echo -n "  Supabase REST API: "
    if curl -sf http://localhost:54321/rest/v1/ -H "apikey: $SUPABASE_ANON_KEY" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
    else
        echo -e "${YELLOW}✗ Not responding (may still be starting)${NC}"
    fi
    
    # Check GoTrue Auth
    echo -n "  Supabase Auth: "
    if curl -sf http://localhost:54321/auth/v1/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
    else
        echo -e "${YELLOW}✗ Not responding${NC}"
    fi
    
    # Check Frontend
    echo -n "  Frontend: "
    if curl -sf http://localhost:8000/ > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
    else
        echo -e "${YELLOW}✗ Not responding${NC}"
    fi
    
    # Check Nginx
    echo -n "  Nginx: "
    if sudo nginx -t > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
    else
        echo -e "${RED}✗ Config error${NC}"
    fi
    
    # =========================================
    # DEPLOYMENT COMPLETE
    # =========================================
    
    echo ""
    echo "======================================="
    echo -e "${GREEN}✅ AtlantisBoard Deployment Complete!${NC}"
    echo "======================================="
    echo ""
    echo "Access your application:"
    if [ "$ENABLE_SSL" = "yes" ]; then
        echo "  Frontend: https://$DOMAIN"
    else
        echo "  Frontend: http://$DOMAIN:$NGINX_HTTP_PORT"
    fi
    echo "  Supabase API: http://localhost:54321"
    echo ""
    echo "Helper scripts in $APP_DIR:"
    echo "  ./start.sh   - Start all services"
    echo "  ./stop.sh    - Stop all services"
    echo "  ./status.sh  - Check service status"
    echo "  ./logs.sh    - View logs (supabase|frontend|all)"
    echo "  ./update.sh  - Pull latest code and rebuild"
    echo "  ./backup.sh  - Backup database"
    echo "  ./restore.sh - Restore from backup"
    echo ""
    echo "Configuration files:"
    echo "  $APP_DIR/.env"
    echo "  $SUPABASE_DOCKER_DIR/.env"
    echo ""
    echo "Logs:"
    echo "  Deployment: $LOG_FILE"
    echo "  Nginx: /var/log/nginx/atlantisboard_*.log"
    echo ""
    echo "======================================="
}

# Run main function
main "$@"
