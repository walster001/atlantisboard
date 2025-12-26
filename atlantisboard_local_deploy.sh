#!/bin/bash

# =====================================================
# AtlantisBoard Full Local Deployment Script
# Ubuntu Jammy | Supabase (Docker) + Supabase CLI + Nginx + HTTPS
# Version: 2.1.0
# =====================================================
# 
# This script is IDEMPOTENT - safe to re-run multiple times
# 
# CRITICAL: Uses set -u and set -o pipefail (NOT set -e)
# to prevent SSH session termination on errors
# 
# Requirements:
#   - Fresh Ubuntu 22.04 (Jammy) or compatible
#   - Root or sudo access
#   - At least 4GB RAM, 20GB disk space
#   - Domain name pointing to this server (for HTTPS)
#
# Architecture:
#   - Supabase core services: Docker-managed (postgres, auth, storage, realtime, kong, functions)
#   - Supabase CLI: Used for management/verification only (NOT for starting services)
#   - Frontend: Docker container (Deno server)
#   - Reverse proxy: Nginx with optional Certbot SSL
#
# =====================================================

# SAFE ERROR HANDLING - No set -e to prevent SSH termination
set -u
set -o pipefail

# =====================================================
# CONFIGURATION & CONSTANTS
# =====================================================

readonly SCRIPT_VERSION="2.1.0"
readonly LOG_FILE="/var/log/atlantisboard_deploy.log"
readonly APP_DIR="${APP_DIR:-$HOME/atlantisboard}"
readonly REPO_URL="https://github.com/walster001/atlantisboard.git"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Docker Compose command - will be detected and stored
DOCKER_COMPOSE_CMD=""

# =====================================================
# HELPER FUNCTIONS
# =====================================================

log() {
    local level="$1"
    local message="$2"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
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
        success "$1 is installed ($(command -v "$1"))"
        return 0
    else
        warn "$1 is not installed"
        return 1
    fi
}

# Detect Docker Compose command - called once and stored in variable
detect_docker_compose() {
    if [ -n "$DOCKER_COMPOSE_CMD" ]; then
        return 0
    fi
    
    # Method 1: Docker Compose plugin (docker compose)
    if docker compose version &>/dev/null 2>&1; then
        DOCKER_COMPOSE_CMD="docker compose"
        info "Detected Docker Compose: docker compose"
        return 0
    fi
    
    # Method 2: Docker Compose plugin with sudo
    if sudo docker compose version &>/dev/null 2>&1; then
        DOCKER_COMPOSE_CMD="sudo docker compose"
        info "Detected Docker Compose: sudo docker compose"
        return 0
    fi
    
    # Method 3: Standalone docker-compose binary
    if command -v docker-compose &>/dev/null; then
        DOCKER_COMPOSE_CMD="docker-compose"
        info "Detected Docker Compose: docker-compose (standalone)"
        return 0
    fi
    
    error "Docker Compose not found"
    return 1
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
        sleep "$interval"
        attempt=$((attempt + 1))
    done
    
    warn "$name did not become ready after $max_attempts attempts (continuing anyway)"
    return 1
}

base64url_encode() {
    openssl base64 -e -A | tr '+/' '-_' | tr -d '='
}

generate_jwt() {
    local payload="$1"
    local secret="$2"
    local header='{"alg":"HS256","typ":"JWT"}'
    local header_b64
    local payload_b64
    local signature
    header_b64=$(echo -n "$header" | base64url_encode)
    payload_b64=$(echo -n "$payload" | base64url_encode)
    signature=$(echo -n "${header_b64}.${payload_b64}" | openssl dgst -sha256 -hmac "$secret" -binary | base64url_encode)
    echo "${header_b64}.${payload_b64}.${signature}"
}

# Safe Docker Compose execution - logs errors but doesn't exit
safe_compose() {
    local compose_file="$1"
    shift
    local cmd="$*"
    
    if [ -z "$DOCKER_COMPOSE_CMD" ]; then
        detect_docker_compose || return 1
    fi
    
    info "Running: $DOCKER_COMPOSE_CMD -f $compose_file $cmd"
    if ! $DOCKER_COMPOSE_CMD -f "$compose_file" $cmd 2>&1 | tee -a "$LOG_FILE"; then
        warn "Docker Compose command had issues (see log)"
        return 1
    fi
    return 0
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
    echo "  • Local Supabase (PostgreSQL, Auth, Storage, Realtime) - Docker managed"
    echo "  • Supabase CLI - For management/verification only"
    echo "  • Edge Functions (Deno runtime)"
    echo "  • Frontend (Vite/React build + Deno server)"
    echo "  • Nginx reverse proxy + HTTPS (Let's Encrypt)"
    echo "  • Google OAuth authentication"
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
    # STEP 1: SYSTEM PREPARATION
    # =========================================
    
    step "1" "Updating system and installing base packages"
    sudo apt update || warn "apt update had issues"
    sudo apt upgrade -y || warn "apt upgrade had issues"
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
        jq \
        wget \
        || warn "Some packages may have failed to install"
    success "Base packages installed"
    
    # =========================================
    # STEP 2: INSTALL DOCKER AND DOCKER COMPOSE
    # =========================================
    
    step "2" "Installing Docker and Docker Compose"
    
    if check_command docker; then
        info "Docker already installed, verifying..."
    else
        info "Installing Docker..."
        
        # Add Docker's official GPG key if not present
        if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
            sudo mkdir -p /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true
        fi
        
        # Add Docker repository if not present
        if [ ! -f /etc/apt/sources.list.d/docker.list ]; then
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
                sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        fi
        
        sudo apt update 2>/dev/null || true
        
        if ! sudo apt install -y docker-ce docker-ce-cli containerd.io 2>/dev/null; then
            info "Trying Docker convenience script..."
            curl -fsSL https://get.docker.com | sudo sh || {
                error "Docker installation failed"
                return 1
            }
        fi
    fi
    
    # Ensure Docker service is running
    sudo systemctl enable docker 2>/dev/null || true
    sudo systemctl start docker 2>/dev/null || true
    
    # Add user to docker group
    if ! groups | grep -q docker; then
        sudo usermod -aG docker "$USER" || true
        warn "Added $USER to docker group. You may need to logout/login for this to take effect."
    fi
    
    # Verify Docker is functional
    if ! sudo docker info > /dev/null 2>&1; then
        error "Docker is not running correctly"
        return 1
    fi
    success "Docker is ready"
    
    # Install Docker Compose v2 using multiple fallback methods
    info "Checking Docker Compose installation..."
    local COMPOSE_INSTALLED=false
    
    # Method 1: Check if docker compose plugin already works
    if docker compose version &>/dev/null 2>&1; then
        COMPOSE_INSTALLED=true
        info "Docker Compose plugin already installed"
    fi
    
    # Method 2: Try installing docker-compose-plugin from Docker apt repo
    if [ "$COMPOSE_INSTALLED" = "false" ]; then
        info "Attempting apt install docker-compose-plugin..."
        if sudo apt install -y docker-compose-plugin 2>/dev/null; then
            if docker compose version &>/dev/null 2>&1; then
                COMPOSE_INSTALLED=true
                info "Docker Compose installed via apt"
            fi
        fi
    fi
    
    # Method 3: Install from GitHub releases as Docker CLI plugin
    if [ "$COMPOSE_INSTALLED" = "false" ]; then
        info "Installing Docker Compose from GitHub releases..."
        local COMPOSE_VERSION
        COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/' 2>/dev/null || echo "v2.27.0")
        local COMPOSE_ARCH
        COMPOSE_ARCH=$(uname -m)
        
        case "$COMPOSE_ARCH" in
            x86_64) COMPOSE_ARCH="x86_64" ;;
            aarch64) COMPOSE_ARCH="aarch64" ;;
            armv7l) COMPOSE_ARCH="armv7" ;;
        esac
        
        local COMPOSE_URL="https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-${COMPOSE_ARCH}"
        
        # Install as Docker CLI plugin (system-wide)
        sudo mkdir -p /usr/local/lib/docker/cli-plugins
        if sudo curl -fsSL "$COMPOSE_URL" -o /usr/local/lib/docker/cli-plugins/docker-compose 2>/dev/null; then
            sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
            if docker compose version &>/dev/null 2>&1; then
                COMPOSE_INSTALLED=true
                info "Docker Compose installed from GitHub as CLI plugin"
            fi
        fi
    fi
    
    # Method 4: Install as standalone binary (legacy fallback)
    if [ "$COMPOSE_INSTALLED" = "false" ]; then
        info "Installing Docker Compose as standalone binary..."
        local COMPOSE_VERSION
        COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/' 2>/dev/null || echo "v2.27.0")
        if sudo curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose 2>/dev/null; then
            sudo chmod +x /usr/local/bin/docker-compose
            if [ -f /usr/local/bin/docker-compose ]; then
                COMPOSE_INSTALLED=true
                info "Docker Compose installed as standalone binary"
            fi
        fi
    fi
    
    if [ "$COMPOSE_INSTALLED" = "false" ]; then
        error "Failed to install Docker Compose"
        return 1
    fi
    
    # Detect and store the compose command for use throughout the script
    detect_docker_compose || {
        error "Docker Compose detection failed"
        return 1
    }
    
    success "Docker Compose ready: $($DOCKER_COMPOSE_CMD version 2>/dev/null | head -1 || echo 'installed')"
    
    # =========================================
    # STEP 3: INSTALL NODE.JS
    # =========================================
    
    step "3" "Installing Node.js 20 LTS"
    
    if check_command node; then
        local NODE_VERSION
        NODE_VERSION=$(node -v)
        info "Node.js $NODE_VERSION already installed"
    else
        info "Installing Node.js 20.x..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - || {
            error "Failed to setup NodeSource"
            return 1
        }
        sudo apt install -y nodejs || {
            error "Failed to install Node.js"
            return 1
        }
    fi
    success "Node.js $(node -v) ready"
    
    # =========================================
    # STEP 4: INSTALL DENO
    # =========================================
    
    step "4" "Installing Deno"
    
    if check_command deno; then
        info "Deno already installed: $(deno --version | head -1)"
    else
        info "Installing Deno..."
        curl -fsSL https://deno.land/install.sh | sh || warn "Deno installation may have issues"
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
    # STEP 5: INSTALL SUPABASE CLI (Management Only)
    # =========================================
    
    step "5" "Installing Supabase CLI (for management only)"
    
    if check_command supabase; then
        info "Supabase CLI already installed: $(supabase --version 2>/dev/null || echo 'unknown')"
    else
        info "Installing Supabase CLI from GitHub releases..."
        
        # Get latest release version
        local SUPABASE_VERSION
        SUPABASE_VERSION=$(curl -s https://api.github.com/repos/supabase/cli/releases/latest | jq -r '.tag_name' 2>/dev/null | sed 's/^v//' || echo "")
        
        if [ -z "$SUPABASE_VERSION" ] || [ "$SUPABASE_VERSION" = "null" ]; then
            SUPABASE_VERSION="1.200.3"
            warn "Could not detect latest version, using $SUPABASE_VERSION"
        fi
        
        info "Downloading Supabase CLI version: $SUPABASE_VERSION"
        
        local DOWNLOAD_URL="https://github.com/supabase/cli/releases/download/v${SUPABASE_VERSION}/supabase_${SUPABASE_VERSION}_linux_amd64.tar.gz"
        local TEMP_DIR
        TEMP_DIR=$(mktemp -d)
        
        if curl -sL "$DOWNLOAD_URL" -o "$TEMP_DIR/supabase.tar.gz" 2>/dev/null; then
            tar -xzf "$TEMP_DIR/supabase.tar.gz" -C "$TEMP_DIR" 2>/dev/null || true
            if [ -f "$TEMP_DIR/supabase" ]; then
                sudo mv "$TEMP_DIR/supabase" /usr/local/bin/supabase
                sudo chmod +x /usr/local/bin/supabase
                success "Supabase CLI installed: $(supabase --version 2>/dev/null || echo 'installed')"
            else
                warn "Supabase CLI binary not found in archive"
            fi
        else
            warn "Failed to download Supabase CLI (non-critical)"
        fi
        
        rm -rf "$TEMP_DIR" 2>/dev/null || true
    fi
    
    # Verify Supabase CLI
    if command -v supabase &>/dev/null; then
        info "Supabase CLI is available for management tasks"
        info "Note: Supabase CLI will NOT be used to start services (Docker manages that)"
    else
        warn "Supabase CLI not available (optional - Docker will manage services)"
    fi
    
    # =========================================
    # STEP 6: CLONE/UPDATE REPOSITORY
    # =========================================
    
    step "6" "Cloning/Updating AtlantisBoard repository"
    
    if [ -d "$APP_DIR" ]; then
        info "Repository exists, pulling latest changes..."
        cd "$APP_DIR" || {
            error "Cannot access $APP_DIR"
            return 1
        }
        git fetch origin || warn "git fetch had issues"
        git reset --hard origin/main 2>/dev/null || git reset --hard origin/master 2>/dev/null || warn "Could not reset to origin"
    else
        info "Cloning repository..."
        git clone "$REPO_URL" "$APP_DIR" || {
            error "Failed to clone repository"
            return 1
        }
        cd "$APP_DIR" || {
            error "Cannot access $APP_DIR"
            return 1
        }
    fi
    success "Repository ready at $APP_DIR"
    
    # =========================================
    # STEP 7: COLLECT CONFIGURATION
    # =========================================
    
    step "7" "Collecting configuration variables"
    
    # Load existing .env if present
    if [ -f "$APP_DIR/.env" ]; then
        info "Found existing .env, loading values as defaults..."
        # shellcheck disable=SC1091
        source "$APP_DIR/.env" 2>/dev/null || true
    fi
    
    echo ""
    echo "Please provide the following configuration values:"
    echo "(Press Enter to accept default values shown in brackets)"
    echo ""
    
    # Domain configuration
    read -r -p "Domain name (e.g., atlantisboard.example.com): " INPUT_DOMAIN
    DOMAIN="${INPUT_DOMAIN:-${APP_DOMAIN:-localhost}}"
    
    read -r -p "Public HTTP port [80]: " INPUT_HTTP_PORT
    NGINX_HTTP_PORT="${INPUT_HTTP_PORT:-${NGINX_HTTP_PORT:-80}}"
    
    read -r -p "Public HTTPS port [443]: " INPUT_HTTPS_PORT
    NGINX_HTTPS_PORT="${INPUT_HTTPS_PORT:-${NGINX_HTTPS_PORT:-443}}"
    
    read -r -p "Enable HTTPS via Certbot? (yes/no) [yes]: " INPUT_SSL
    ENABLE_SSL="${INPUT_SSL:-yes}"
    
    if [ "$ENABLE_SSL" = "yes" ]; then
        read -r -p "Certbot email address: " INPUT_EMAIL
        CERTBOT_EMAIL="${INPUT_EMAIL:-${CERTBOT_EMAIL:-admin@$DOMAIN}}"
    fi
    
    echo ""
    echo "--- Google OAuth Configuration ---"
    read -r -p "Google OAuth Client ID: " INPUT_GOOGLE_ID
    GOOGLE_CLIENT_ID="${INPUT_GOOGLE_ID:-${GOOGLE_CLIENT_ID:-}}"
    
    read -r -p "Google OAuth Client Secret: " INPUT_GOOGLE_SECRET
    GOOGLE_CLIENT_SECRET="${INPUT_GOOGLE_SECRET:-${GOOGLE_CLIENT_SECRET:-}}"
    
    GOOGLE_REDIRECT_URI="https://$DOMAIN/auth/callback"
    
    echo ""
    echo "--- External MySQL Configuration (Optional) ---"
    read -r -p "MySQL Host [skip]: " INPUT_MYSQL_HOST
    MYSQL_HOST="${INPUT_MYSQL_HOST:-${EXTERNAL_MYSQL_HOST:-}}"
    
    if [ -n "$MYSQL_HOST" ]; then
        read -r -p "MySQL Port [3306]: " INPUT_MYSQL_PORT
        MYSQL_PORT="${INPUT_MYSQL_PORT:-${EXTERNAL_MYSQL_PORT:-3306}}"
        
        read -r -p "MySQL User: " INPUT_MYSQL_USER
        MYSQL_USER="${INPUT_MYSQL_USER:-${EXTERNAL_MYSQL_USER:-}}"
        
        read -r -p "MySQL Password: " INPUT_MYSQL_PASSWORD
        MYSQL_PASSWORD="${INPUT_MYSQL_PASSWORD:-${EXTERNAL_MYSQL_PASSWORD:-}}"
        
        read -r -p "MySQL Database: " INPUT_MYSQL_DB
        MYSQL_DB="${INPUT_MYSQL_DB:-${EXTERNAL_MYSQL_DATABASE:-}}"
    fi
    
    success "Configuration collected"
    
    # =========================================
    # STEP 8: GENERATE JWT KEYS
    # =========================================
    
    step "8" "Generating JWT keys"
    
    # Generate new keys or use existing
    if [ -n "${JWT_SECRET:-}" ]; then
        info "Using existing JWT_SECRET"
    else
        info "Generating new JWT secret..."
        JWT_SECRET=$(openssl rand -base64 32)
    fi
    
    # Generate timestamps
    local IAT
    local EXP
    IAT=$(date +%s)
    EXP=$((IAT + 315360000))  # 10 years
    
    # Generate anon key
    local ANON_PAYLOAD="{\"role\":\"anon\",\"iss\":\"supabase\",\"iat\":$IAT,\"exp\":$EXP}"
    SUPABASE_ANON_KEY=$(generate_jwt "$ANON_PAYLOAD" "$JWT_SECRET")
    
    # Generate service_role key
    local SERVICE_PAYLOAD="{\"role\":\"service_role\",\"iss\":\"supabase\",\"iat\":$IAT,\"exp\":$EXP}"
    SUPABASE_SERVICE_KEY=$(generate_jwt "$SERVICE_PAYLOAD" "$JWT_SECRET")
    
    # Generate secret key base for Realtime
    SECRET_KEY_BASE=$(openssl rand -base64 48)
    
    success "JWT keys generated"
    info "Anon Key: ${SUPABASE_ANON_KEY:0:40}..."
    info "Service Key: ${SUPABASE_SERVICE_KEY:0:40}..."
    
    # =========================================
    # STEP 9: CREATE SUPABASE DOCKER CONFIGURATION
    # =========================================
    
    step "9" "Creating Supabase Docker configuration"
    
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
    
    # Store Docker Compose command for helper scripts
    echo "DOCKER_COMPOSE_CMD=\"$DOCKER_COMPOSE_CMD\"" > "$SUPABASE_DOCKER_DIR/.compose_cmd"
    
    success "Supabase Docker environment created"
    
    # =========================================
    # STEP 10: START SUPABASE DOCKER SERVICES
    # =========================================
    
    step "10" "Starting Supabase Docker services"
    
    cd "$SUPABASE_DOCKER_DIR" || {
        error "Cannot access Supabase Docker directory"
        return 1
    }
    
    local COMPOSE_FILE="docker-compose.supabase.yml"
    
    if [ ! -f "$COMPOSE_FILE" ]; then
        error "Docker Compose file not found: $SUPABASE_DOCKER_DIR/$COMPOSE_FILE"
        return 1
    fi
    
    info "Using compose file: $SUPABASE_DOCKER_DIR/$COMPOSE_FILE"
    
    # Stop existing services gracefully
    info "Stopping any existing Supabase services..."
    $DOCKER_COMPOSE_CMD -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true
    sleep 5
    
    # Clean up stale containers (don't fail if they don't exist)
    info "Cleaning up stale containers..."
    for container in supabase-db supabase-auth supabase-rest supabase-realtime supabase-storage supabase-imgproxy supabase-kong supabase-functions; do
        docker rm -f "$container" 2>/dev/null || true
    done
    
    # Ensure network exists
    docker network create supabase-net 2>/dev/null || true
    
    # Pull images with retry
    info "Pulling Docker images (this may take a few minutes)..."
    local pull_attempt
    for pull_attempt in 1 2 3; do
        if $DOCKER_COMPOSE_CMD -f "$COMPOSE_FILE" pull 2>&1 | tee -a "$LOG_FILE"; then
            success "Docker images pulled"
            break
        fi
        if [ $pull_attempt -lt 3 ]; then
            warn "Pull attempt $pull_attempt failed, retrying in 10s..."
            sleep 10
        else
            warn "Image pull had issues, continuing with existing images..."
        fi
    done
    
    # Start database first
    info "Starting PostgreSQL database..."
    if ! $DOCKER_COMPOSE_CMD -f "$COMPOSE_FILE" up -d db 2>&1 | tee -a "$LOG_FILE"; then
        error "Failed to start PostgreSQL"
        return 1
    fi
    
    # Wait for PostgreSQL to be ready (with grace period for initialization)
    # The Supabase postgres image creates auth/storage schemas on first run
    info "Waiting for PostgreSQL to be ready..."
    info "Note: First run may take 1-2 minutes for schema initialization..."
    
    local db_ready=false
    local db_attempt
    for db_attempt in $(seq 1 60); do
        # First check if container is running
        if ! docker ps --format '{{.Names}}' | grep -q "^supabase-db$"; then
            warn "PostgreSQL container not running, waiting..."
            sleep 5
            continue
        fi
        
        # Check basic PostgreSQL connectivity
        if docker exec supabase-db pg_isready -U postgres -d postgres >/dev/null 2>&1; then
            # Check if auth schema exists (created by Supabase postgres image)
            if docker exec supabase-db psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_namespace WHERE nspname = 'auth'" 2>/dev/null | grep -q "1"; then
                db_ready=true
                break
            fi
        fi
        
        if [ $((db_attempt % 6)) -eq 0 ]; then
            info "  Still waiting for PostgreSQL... ($((db_attempt * 5))s elapsed)"
        fi
        sleep 5
    done
    
    if [ "$db_ready" = "false" ]; then
        warn "PostgreSQL did not become fully ready (auth schema may still be initializing)"
        warn "Continuing anyway - services may need a restart..."
    else
        success "PostgreSQL is ready with auth schema"
    fi
    
    # Add grace period for auth.users table
    info "Checking for auth.users table..."
    local auth_ready=false
    for auth_attempt in $(seq 1 20); do
        if docker exec supabase-db psql -U postgres -d postgres -c "SELECT 1 FROM auth.users LIMIT 1" >/dev/null 2>&1; then
            auth_ready=true
            break
        fi
        sleep 3
    done
    
    if [ "$auth_ready" = "true" ]; then
        success "auth.users table is available"
    else
        warn "auth.users table not immediately available (GoTrue will create it)"
    fi
    
    # Start remaining services
    info "Starting remaining Supabase services..."
    if ! $DOCKER_COMPOSE_CMD -f "$COMPOSE_FILE" up -d 2>&1 | tee -a "$LOG_FILE"; then
        warn "Some services may have failed to start"
    fi
    
    # Wait for services to stabilize
    info "Waiting for services to stabilize (30s)..."
    sleep 30
    
    # Verify services
    info "Verifying services..."
    local REQUIRED_SERVICES="supabase-db supabase-auth supabase-rest supabase-realtime supabase-storage supabase-kong"
    local OPTIONAL_SERVICES="supabase-imgproxy supabase-functions"
    local ALL_RUNNING=true
    
    echo ""
    for svc in $REQUIRED_SERVICES; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${svc}$"; then
            local HEALTH
            HEALTH=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' "$svc" 2>/dev/null || echo "unknown")
            if [ "$HEALTH" = "healthy" ] || [ "$HEALTH" = "running" ]; then
                success "  ✓ $svc ($HEALTH)"
            else
                warn "  ~ $svc (starting: $HEALTH)"
            fi
        else
            error "  ✗ $svc NOT running"
            docker logs "$svc" --tail 10 2>&1 || true
            ALL_RUNNING=false
        fi
    done
    
    for svc in $OPTIONAL_SERVICES; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${svc}$"; then
            success "  ✓ $svc (optional)"
        else
            info "  - $svc not running (optional)"
        fi
    done
    
    if [ "$ALL_RUNNING" = "false" ]; then
        warn "Some required services are not running - deployment may have issues"
    else
        success "All required Supabase services are running"
    fi
    
    cd "$APP_DIR" || true
    
    # =========================================
    # STEP 11: VERIFY DATABASE AND IMPORT SCHEMA
    # =========================================
    
    step "11" "Verifying database and importing schema"
    
    local DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
    
    # Wait for PostgreSQL to be accessible from host
    info "Verifying PostgreSQL is accessible from host..."
    if ! wait_for_service "PostgreSQL (host access)" \
        "PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -c 'SELECT 1'" 30 2; then
        warn "PostgreSQL not accessible from host (may need port forwarding)"
    fi
    
    # Import schema if not already done
    local SCHEMA_FILE="$APP_DIR/supabase/db/schema.sql"
    
    if [ ! -f "$SCHEMA_FILE" ]; then
        warn "Schema file not found: $SCHEMA_FILE"
    else
        # Check if schema already exists
        local PROFILES_EXISTS
        PROFILES_EXISTS=$(PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -tAc \
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles')" 2>/dev/null || echo "f")
        
        if [ "$PROFILES_EXISTS" = "t" ]; then
            info "Application schema already exists (profiles table found)"
            info "Skipping schema import to avoid duplicates"
        else
            info "Importing schema from $SCHEMA_FILE..."
            info "Running: psql \$DATABASE_URL < $SCHEMA_FILE"
            
            if PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -f "$SCHEMA_FILE" 2>&1 | tee /tmp/schema_import.log | tail -20; then
                if grep -qi "error\|fatal" /tmp/schema_import.log 2>/dev/null; then
                    warn "Schema import completed with some errors (see /tmp/schema_import.log)"
                else
                    success "Schema imported successfully"
                fi
            else
                warn "Schema import had issues"
            fi
            
            # Verify import
            local TABLE_COUNT
            TABLE_COUNT=$(PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -tAc \
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null || echo "0")
            info "Created $TABLE_COUNT tables in public schema"
        fi
    fi
    
    # =========================================
    # STEP 12: APPLY SEED DATA
    # =========================================
    
    step "12" "Applying seed data"
    
    local SEED_FILE="$APP_DIR/supabase/seed.sql"
    
    if [ -f "$SEED_FILE" ]; then
        info "Applying seed data from $SEED_FILE..."
        if PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -f "$SEED_FILE" 2>&1 | tail -10; then
            success "Seed data applied"
        else
            warn "Seed data may have had issues (non-critical)"
        fi
    else
        info "No seed file found: $SEED_FILE (skipping)"
    fi
    
    # =========================================
    # STEP 13: CONFIGURE STORAGE BUCKETS
    # =========================================
    
    step "13" "Configuring storage buckets"
    
    local STORAGE_FILE="$APP_DIR/supabase/storage/buckets.sql"
    
    if [ -f "$STORAGE_FILE" ]; then
        local STORAGE_TABLE
        STORAGE_TABLE=$(PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -tAc \
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets')" 2>/dev/null || echo "f")
        
        if [ "$STORAGE_TABLE" = "t" ]; then
            info "Applying storage configuration..."
            if PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -f "$STORAGE_FILE" 2>&1 | tail -10; then
                success "Storage buckets configured"
            else
                warn "Storage bucket configuration may have had issues"
            fi
        else
            warn "storage.buckets table not found - storage service may still be initializing"
        fi
    else
        info "No storage config file found: $STORAGE_FILE (skipping)"
    fi
    
    # =========================================
    # STEP 14: SUPABASE CLI VERIFICATION (Read-Only)
    # =========================================
    
    step "14" "Supabase CLI verification (read-only)"
    
    if command -v supabase &>/dev/null; then
        info "Running Supabase CLI status checks (read-only)..."
        
        # Show CLI version
        supabase --version 2>/dev/null || true
        
        # Note: We're NOT using 'supabase start' - Docker manages services
        info "Note: Supabase services are Docker-managed, CLI is for verification only"
        
        # Show edge functions if available
        if [ -d "$APP_DIR/supabase/functions" ]; then
            info "Edge Functions available:"
            for func in "$APP_DIR/supabase/functions"/*/; do
                if [ -d "$func" ]; then
                    local FUNC_NAME
                    FUNC_NAME=$(basename "$func")
                    if [ -f "$func/index.ts" ]; then
                        success "  • $FUNC_NAME"
                    fi
                fi
            done
        fi
    else
        info "Supabase CLI not installed (optional for this deployment)"
    fi
    
    # =========================================
    # STEP 15: CREATE UNIFIED ENV FILE
    # =========================================
    
    step "15" "Creating unified app .env file"
    
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

# --------------------------
# Docker Compose Command
# --------------------------
DOCKER_COMPOSE_CMD="$DOCKER_COMPOSE_CMD"
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
    # STEP 16: INSTALL FRONTEND DEPENDENCIES
    # =========================================
    
    step "16" "Installing frontend dependencies"
    
    cd "$APP_DIR" || {
        error "Cannot access $APP_DIR"
        return 1
    }
    
    info "Installing npm packages..."
    if npm install --legacy-peer-deps 2>&1 | tail -20; then
        success "npm packages installed successfully"
    else
        warn "npm install had warnings, trying with --force..."
        npm install --force 2>&1 | tail -20 || warn "npm install had issues"
    fi
    
    # =========================================
    # STEP 17: BUILD FRONTEND
    # =========================================
    
    step "17" "Building frontend"
    
    info "Running Vite build..."
    if npm run build 2>&1 | tail -30; then
        success "Frontend build completed"
    else
        error "Frontend build failed"
        return 1
    fi
    
    # Move build to frontend directory
    mkdir -p "$APP_DIR/frontend"
    rm -rf "$APP_DIR/frontend/dist" 2>/dev/null || true
    mv "$APP_DIR/dist" "$APP_DIR/frontend/"
    
    success "Frontend built and moved to frontend/dist"
    
    # =========================================
    # STEP 18: CREATE HELPER SCRIPTS
    # =========================================
    
    step "18" "Creating helper scripts"
    
    # status.sh - Full status helper
    cat > "$APP_DIR/status.sh" <<STATUSEOF
#!/bin/bash
# AtlantisBoard Status Helper
# Shows status of all services

# Load compose command
COMPOSE_CMD="${DOCKER_COMPOSE_CMD}"
SUPABASE_DIR="${SUPABASE_DOCKER_DIR}"
APP_DIR="${APP_DIR}"

echo "=============================================="
echo "AtlantisBoard Status"
echo "=============================================="
echo ""

echo "=== Supabase Containers ==="
docker ps -a --filter "name=supabase" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "No Supabase containers found"
echo ""

echo "=== Frontend Container ==="
docker ps -a --filter "name=atlantis" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "No frontend container found"
echo ""

echo "=== Service Health ==="
for service in supabase-db supabase-auth supabase-rest supabase-realtime supabase-storage supabase-kong; do
    if docker ps --format '{{.Names}}' | grep -q "^\${service}\$"; then
        echo "  ✓ \${service}: Running"
    else
        echo "  ✗ \${service}: Not Running"
    fi
done
echo ""

echo "=== Database Connectivity ==="
if PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -c "SELECT 1" >/dev/null 2>&1; then
    echo "  ✓ PostgreSQL: Accessible"
else
    echo "  ✗ PostgreSQL: Not accessible"
fi
echo ""

echo "=== Nginx Status ==="
systemctl is-active nginx 2>/dev/null && echo "  ✓ Nginx: Running" || echo "  ✗ Nginx: Not running"
echo ""

echo "=== Disk Usage ==="
df -h / | tail -1
echo ""
STATUSEOF
    chmod +x "$APP_DIR/status.sh"
    success "Created status.sh"
    
    # logs.sh - Logs helper
    cat > "$APP_DIR/logs.sh" <<LOGSEOF
#!/bin/bash
# AtlantisBoard Logs Helper
# Usage: ./logs.sh [service_name] [lines]

COMPOSE_CMD="${DOCKER_COMPOSE_CMD}"
SUPABASE_DIR="${SUPABASE_DOCKER_DIR}"
SERVICE="\${1:-all}"
LINES="\${2:-50}"

echo "=============================================="
echo "AtlantisBoard Logs"
echo "=============================================="

case "\$SERVICE" in
    all)
        echo ""
        echo "=== Recent logs from all Supabase services ==="
        for svc in supabase-db supabase-auth supabase-rest supabase-realtime supabase-storage supabase-kong supabase-functions; do
            if docker ps --format '{{.Names}}' | grep -q "^\${svc}\$"; then
                echo ""
                echo "--- \${svc} (last \${LINES} lines) ---"
                docker logs "\${svc}" --tail "\${LINES}" 2>&1 || true
            fi
        done
        ;;
    supabase)
        cd "\$SUPABASE_DIR" 2>/dev/null && \$COMPOSE_CMD -f docker-compose.supabase.yml logs --tail "\$LINES" 2>/dev/null || echo "Cannot get Supabase logs"
        ;;
    frontend)
        docker logs atlantis-deno --tail "\$LINES" 2>&1 || echo "Frontend container not found"
        ;;
    *)
        echo "Showing logs for: \$SERVICE"
        docker logs "\$SERVICE" --tail "\$LINES" 2>&1 || echo "Container not found: \$SERVICE"
        ;;
esac
LOGSEOF
    chmod +x "$APP_DIR/logs.sh"
    success "Created logs.sh"
    
    # restart.sh - Restart helper
    cat > "$APP_DIR/restart.sh" <<RESTARTEOF
#!/bin/bash
# AtlantisBoard Restart Helper
# Usage: ./restart.sh [service_name|all|supabase|frontend]

COMPOSE_CMD="${DOCKER_COMPOSE_CMD}"
SUPABASE_DIR="${SUPABASE_DOCKER_DIR}"
APP_DIR="${APP_DIR}"
SERVICE="\${1:-all}"

echo "=============================================="
echo "AtlantisBoard Restart"
echo "=============================================="

case "\$SERVICE" in
    all)
        echo "Restarting all services..."
        echo ""
        echo "Stopping frontend..."
        cd "\$APP_DIR" 2>/dev/null && \$COMPOSE_CMD down 2>/dev/null || true
        echo "Stopping Supabase..."
        cd "\$SUPABASE_DIR" 2>/dev/null && \$COMPOSE_CMD -f docker-compose.supabase.yml down 2>/dev/null || true
        sleep 5
        echo "Starting Supabase..."
        cd "\$SUPABASE_DIR" 2>/dev/null && \$COMPOSE_CMD -f docker-compose.supabase.yml up -d 2>/dev/null || true
        sleep 10
        echo "Starting frontend..."
        cd "\$APP_DIR" 2>/dev/null && \$COMPOSE_CMD up -d 2>/dev/null || true
        ;;
    supabase)
        echo "Restarting Supabase services..."
        cd "\$SUPABASE_DIR" 2>/dev/null && \$COMPOSE_CMD -f docker-compose.supabase.yml down 2>/dev/null || true
        sleep 5
        cd "\$SUPABASE_DIR" 2>/dev/null && \$COMPOSE_CMD -f docker-compose.supabase.yml up -d 2>/dev/null || true
        ;;
    frontend)
        echo "Restarting frontend..."
        cd "\$APP_DIR" 2>/dev/null && \$COMPOSE_CMD restart 2>/dev/null || true
        ;;
    *)
        echo "Restarting container: \$SERVICE"
        docker restart "\$SERVICE" 2>/dev/null || echo "Failed to restart \$SERVICE"
        ;;
esac

echo ""
echo "Waiting for services to stabilize..."
sleep 10

echo ""
echo "=== Current Status ==="
docker ps --filter "name=supabase" --filter "name=atlantis" --format "table {{.Names}}\t{{.Status}}"
RESTARTEOF
    chmod +x "$APP_DIR/restart.sh"
    success "Created restart.sh"
    
    # backup.sh - Backup helper
    cat > "$APP_DIR/backup.sh" <<BACKUPEOF
#!/bin/bash
# AtlantisBoard Backup Helper
# Creates database backup

BACKUP_DIR="\${HOME}/atlantisboard_backups"
TIMESTAMP=\$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="\${BACKUP_DIR}/db_\${TIMESTAMP}.sql"

echo "=============================================="
echo "AtlantisBoard Backup"
echo "=============================================="

mkdir -p "\$BACKUP_DIR"

echo "Creating database backup..."
if PGPASSWORD=postgres pg_dump -h localhost -p 5432 -U postgres -d postgres > "\$BACKUP_FILE" 2>/dev/null; then
    echo "Backup created: \$BACKUP_FILE"
    echo "Size: \$(du -h "\$BACKUP_FILE" | cut -f1)"
    
    # Keep only last 7 backups
    echo ""
    echo "Cleaning old backups (keeping last 7)..."
    ls -t "\$BACKUP_DIR"/db_*.sql 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null || true
    
    echo ""
    echo "Current backups:"
    ls -lh "\$BACKUP_DIR"/db_*.sql 2>/dev/null || echo "No backups found"
else
    echo "Backup failed - is PostgreSQL accessible?"
    exit 1
fi
BACKUPEOF
    chmod +x "$APP_DIR/backup.sh"
    success "Created backup.sh"
    
    # start.sh
    cat > "$APP_DIR/start.sh" <<STARTEOF
#!/bin/bash
# AtlantisBoard Start Helper

COMPOSE_CMD="${DOCKER_COMPOSE_CMD}"
SUPABASE_DIR="${SUPABASE_DOCKER_DIR}"
APP_DIR="${APP_DIR}"

echo "Starting AtlantisBoard services..."
echo ""

echo "Starting Supabase..."
cd "\$SUPABASE_DIR" 2>/dev/null && \$COMPOSE_CMD -f docker-compose.supabase.yml up -d 2>/dev/null || true
sleep 10

echo "Starting frontend..."
cd "\$APP_DIR" 2>/dev/null && \$COMPOSE_CMD up -d 2>/dev/null || true

echo ""
echo "Services started!"
echo "  Frontend: http://localhost:8000"
echo "  Supabase API: http://localhost:54321"
STARTEOF
    chmod +x "$APP_DIR/start.sh"
    
    # stop.sh
    cat > "$APP_DIR/stop.sh" <<STOPEOF
#!/bin/bash
# AtlantisBoard Stop Helper

COMPOSE_CMD="${DOCKER_COMPOSE_CMD}"
SUPABASE_DIR="${SUPABASE_DOCKER_DIR}"
APP_DIR="${APP_DIR}"

echo "Stopping AtlantisBoard services..."

echo "Stopping frontend..."
cd "\$APP_DIR" 2>/dev/null && \$COMPOSE_CMD down 2>/dev/null || true

echo "Stopping Supabase..."
cd "\$SUPABASE_DIR" 2>/dev/null && \$COMPOSE_CMD -f docker-compose.supabase.yml down 2>/dev/null || true

echo "All services stopped."
STOPEOF
    chmod +x "$APP_DIR/stop.sh"
    
    # update.sh
    cat > "$APP_DIR/update.sh" <<UPDATEEOF
#!/bin/bash
# AtlantisBoard Update Helper

APP_DIR="${APP_DIR}"
cd "\$APP_DIR" || exit 1

echo "Updating AtlantisBoard..."
git pull || exit 1
npm install --legacy-peer-deps || exit 1
npm run build || exit 1
rm -rf frontend/dist 2>/dev/null || true
mv dist frontend/ || exit 1

echo "Restarting frontend..."
${DOCKER_COMPOSE_CMD} restart 2>/dev/null || true

echo "Update complete!"
UPDATEEOF
    chmod +x "$APP_DIR/update.sh"
    
    # restore.sh
    cat > "$APP_DIR/restore.sh" <<RESTOREEOF
#!/bin/bash
# AtlantisBoard Restore Helper

if [ -z "\$1" ]; then
    echo "Usage: ./restore.sh <backup.sql>"
    exit 1
fi

echo "Restoring database from: \$1"
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres < "\$1" || exit 1
echo "Database restored."
RESTOREEOF
    chmod +x "$APP_DIR/restore.sh"
    
    success "All helper scripts created"
    
    # =========================================
    # STEP 19: SETUP DENO SERVER AND FRONTEND COMPOSE
    # =========================================
    
    step "19" "Setting up Deno server and frontend compose"
    
    mkdir -p "$APP_DIR/server"
    
    cat > "$APP_DIR/server/server.ts" <<'SERVEREOF'
// AtlantisBoard Deno Static File Server
// Serves the frontend build with SPA fallback

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const PORT = parseInt(Deno.env.get("PORT") || "8000");
const FRONTEND_DIR = "./frontend/dist";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
};

async function serveFile(path: string): Promise<Response | null> {
  try {
    const file = await Deno.readFile(path);
    const ext = path.substring(path.lastIndexOf("."));
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    return new Response(file, {
      headers: { "content-type": contentType },
    });
  } catch {
    return null;
  }
}

console.log(`Starting AtlantisBoard server on port ${PORT}...`);
console.log(`Serving files from ${FRONTEND_DIR}`);

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
SERVEREOF
    
    success "Deno server script created"
    
    # Create frontend docker-compose.yml (no version attribute)
    cat > "$APP_DIR/docker-compose.yml" <<'COMPOSEEOF'
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
COMPOSEEOF
    
    success "Frontend Docker Compose configuration created"
    
    # Start frontend container
    info "Starting frontend container..."
    cd "$APP_DIR" || true
    $DOCKER_COMPOSE_CMD up -d 2>&1 | tee -a "$LOG_FILE" || warn "Frontend container start had issues"
    
    wait_for_service "Deno frontend" "curl -sf http://localhost:8000/" 30 5 || warn "Frontend may still be starting"
    
    # =========================================
    # STEP 20: CONFIGURE NGINX
    # =========================================
    
    step "20" "Configuring Nginx"
    
    local NGINX_CONF="/etc/nginx/sites-available/atlantisboard"
    local NGINX_ENABLED="/etc/nginx/sites-enabled/atlantisboard"
    
    # Remove default nginx config if exists
    sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    
    sudo tee "$NGINX_CONF" > /dev/null <<NGINXEOF
# AtlantisBoard Nginx Configuration
# Generated by atlantisboard_local_deploy.sh v$SCRIPT_VERSION

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
NGINXEOF
    
    # Enable site
    sudo ln -sf "$NGINX_CONF" "$NGINX_ENABLED"
    
    # Test nginx config
    if sudo nginx -t 2>&1 | tee -a "$LOG_FILE"; then
        success "Nginx configuration is valid"
        sudo systemctl reload nginx || sudo systemctl restart nginx || true
    else
        warn "Nginx configuration test failed"
    fi
    
    # =========================================
    # STEP 21: SETUP HTTPS (Optional)
    # =========================================
    
    step "21" "Setting up HTTPS (if enabled)"
    
    if [ "$ENABLE_SSL" = "yes" ]; then
        info "Requesting SSL certificate from Let's Encrypt..."
        
        if getent hosts "$DOMAIN" > /dev/null 2>&1; then
            sudo certbot --nginx -d "$DOMAIN" \
                --non-interactive \
                --agree-tos \
                -m "$CERTBOT_EMAIL" \
                --redirect 2>&1 | tee -a "$LOG_FILE" || {
                    warn "Certbot failed. HTTPS setup incomplete."
                    warn "You can try again manually: sudo certbot --nginx -d $DOMAIN"
                }
            
            # Setup auto-renewal cron
            echo "0 3 * * * root certbot renew --quiet && systemctl reload nginx" | sudo tee /etc/cron.d/certbot-renew > /dev/null
            
            success "HTTPS configured with auto-renewal"
        else
            warn "Domain $DOMAIN does not resolve. Skipping HTTPS setup."
            warn "Configure DNS, then run: sudo certbot --nginx -d $DOMAIN"
        fi
    else
        info "HTTPS disabled, running HTTP only"
    fi
    
    # =========================================
    # STEP 22: CREATE SYSTEMD SERVICE (Safe)
    # =========================================
    
    step "22" "Creating systemd services (safe configuration)"
    
    # Main AtlantisBoard service - uses oneshot with safe error handling
    sudo tee /etc/systemd/system/atlantisboard.service > /dev/null <<SYSTEMDEOF
[Unit]
Description=AtlantisBoard Application (Frontend + Supabase)
After=docker.service network-online.target
Wants=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
TimeoutStartSec=300
TimeoutStopSec=120

# Start services - use || true to prevent boot failures
ExecStart=/bin/bash -c 'cd $SUPABASE_DOCKER_DIR && $DOCKER_COMPOSE_CMD -f docker-compose.supabase.yml up -d || true'
ExecStart=/bin/bash -c 'sleep 15'
ExecStart=/bin/bash -c 'cd $APP_DIR && $DOCKER_COMPOSE_CMD up -d || true'

# Stop services gracefully
ExecStop=/bin/bash -c 'cd $APP_DIR && $DOCKER_COMPOSE_CMD down || true'
ExecStop=/bin/bash -c 'cd $SUPABASE_DOCKER_DIR && $DOCKER_COMPOSE_CMD -f docker-compose.supabase.yml down || true'

[Install]
WantedBy=multi-user.target
SYSTEMDEOF
    
    sudo systemctl daemon-reload
    sudo systemctl enable atlantisboard 2>/dev/null || true
    sudo systemctl enable nginx 2>/dev/null || true
    
    success "Systemd services configured (safe mode - won't block boot on failure)"
    
    # =========================================
    # STEP 23: FINAL HEALTH CHECKS
    # =========================================
    
    step "23" "Final health checks"
    
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
        echo -e "${YELLOW}~ Not responding (may still be starting)${NC}"
    fi
    
    # Check GoTrue Auth
    echo -n "  Supabase Auth: "
    if curl -sf http://localhost:54321/auth/v1/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
    else
        echo -e "${YELLOW}~ Not responding${NC}"
    fi
    
    # Check Frontend
    echo -n "  Frontend: "
    if curl -sf http://localhost:8000/ > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
    else
        echo -e "${YELLOW}~ Not responding${NC}"
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
    echo "  ./logs.sh    - View logs (supabase|frontend|all|<container>)"
    echo "  ./restart.sh - Restart services (all|supabase|frontend|<container>)"
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
    echo "Docker Compose command in use: $DOCKER_COMPOSE_CMD"
    echo ""
    echo "======================================="
}

# Run main function
main "$@"
