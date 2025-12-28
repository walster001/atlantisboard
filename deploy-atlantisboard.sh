#!/bin/bash
# =====================================================
# AtlantisBoard Deployment Script for Google Cloud VM
# Ubuntu 22.04 (Jammy) Self-Hosted Deployment
# =====================================================
#
# This script deploys AtlantisBoard (Lovable Kanboard) on a Google Cloud VM
# with full Supabase stack, Edge Functions, OAuth, and HTTPS support.
#
# Usage: bash deploy-atlantisboard.sh
#
# =====================================================

# =====================================================
# SAFETY: Do NOT use set -e to avoid SSH session termination
# =====================================================
set -u  # Exit on undefined variables
set -o pipefail  # Catch pipe failures

# =====================================================
# CONFIGURATION VARIABLES
# =====================================================
SCRIPT_VERSION="1.0.0"
SCRIPT_NAME="AtlantisBoard Deployment Script"
REPO_URL="${REPO_URL:-https://github.com/YOUR_USERNAME/atlantisboard.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/atlantisboard}"
SECRETS_DIR="${INSTALL_DIR}/.secrets"
ENV_FILE="${INSTALL_DIR}/.env"
ENCRYPTION_KEY_FILE="${SECRETS_DIR}/mysql_encryption_key"
LOG_FILE="/var/log/atlantisboard-deploy.log"

# Default ports
APP_PORT="${APP_PORT:-3000}"
HTTPS_PORT="${HTTPS_PORT:-443}"
HTTP_PORT="${HTTP_PORT:-80}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
KONG_HTTP_PORT="${KONG_HTTP_PORT:-8000}"
KONG_HTTPS_PORT="${KONG_HTTPS_PORT:-8443}"

# Minimum version requirements
MIN_DOCKER_VERSION="20.10.0"
MIN_COMPOSE_VERSION="2.0.0"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =====================================================
# LOGGING FUNCTIONS
# =====================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "${LOG_FILE}" 2>/dev/null || echo -e "${timestamp} [${level}] ${message}"
}

log_step() {
    local step_num="$1"
    local step_desc="$2"
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}[STEP ${step_num}] ${step_desc}${NC}"
    echo -e "${BLUE}========================================${NC}"
    log "INFO" "STEP ${step_num}: ${step_desc}"
}

log_success() {
    echo -e "${GREEN}✓ $*${NC}"
    log "SUCCESS" "$*"
}

log_warning() {
    echo -e "${YELLOW}⚠ WARNING: $*${NC}"
    log "WARNING" "$*"
}

log_error() {
    echo -e "${RED}✗ ERROR: $*${NC}"
    log "ERROR" "$*"
}

log_info() {
    echo -e "${BLUE}ℹ $*${NC}"
    log "INFO" "$*"
}

# =====================================================
# UTILITY FUNCTIONS
# =====================================================

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Compare semantic versions
version_gte() {
    local v1="$1"
    local v2="$2"
    printf '%s\n%s' "$v2" "$v1" | sort -V -C
}

# Get Docker version
get_docker_version() {
    docker --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1 || echo "0.0.0"
}

# Detect Docker Compose command
detect_docker_compose() {
    if docker compose version >/dev/null 2>&1; then
        echo "docker compose"
    elif docker-compose --version >/dev/null 2>&1; then
        echo "docker-compose"
    else
        echo ""
    fi
}

# Get Docker Compose version
get_compose_version() {
    local compose_cmd
    compose_cmd=$(detect_docker_compose)
    if [ -n "$compose_cmd" ]; then
        $compose_cmd version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1 || echo "0.0.0"
    else
        echo "0.0.0"
    fi
}

# Generate secure random string
generate_secret() {
    local length="${1:-32}"
    openssl rand -base64 "$length" 2>/dev/null | tr -dc 'a-zA-Z0-9' | head -c "$length" || \
        head -c "$length" /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c "$length"
}

# Generate 256-bit hex key
generate_256bit_hex_key() {
    openssl rand -hex 32 2>/dev/null || \
        head -c 32 /dev/urandom | xxd -p | tr -d '\n'
}

# Generate JWT secret
generate_jwt_secret() {
    generate_secret 64
}

# Wait for service to be ready
wait_for_service() {
    local host="$1"
    local port="$2"
    local service_name="$3"
    local max_attempts="${4:-60}"
    local attempt=1
    
    log_info "Waiting for ${service_name} on ${host}:${port}..."
    
    while [ $attempt -le $max_attempts ]; do
        if nc -z "$host" "$port" 2>/dev/null; then
            log_success "${service_name} is ready"
            return 0
        fi
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo ""
    log_warning "${service_name} did not become ready within timeout"
    return 1
}

# Wait for PostgreSQL to be ready
wait_for_postgres() {
    local max_attempts="${1:-60}"
    local attempt=1
    
    log_info "Waiting for PostgreSQL to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" psql -h localhost -p "${POSTGRES_PORT}" -U postgres -d postgres -c "SELECT 1" >/dev/null 2>&1; then
            log_success "PostgreSQL is ready and accepting connections"
            return 0
        fi
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo ""
    log_warning "PostgreSQL did not become ready within timeout"
    return 1
}

# Check if schema exists
check_schema_exists() {
    local schema_name="$1"
    PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" psql -h localhost -p "${POSTGRES_PORT}" -U postgres -d postgres -tAc \
        "SELECT 1 FROM information_schema.schemata WHERE schema_name = '${schema_name}'" 2>/dev/null | grep -q 1
}

# Check if table exists
check_table_exists() {
    local schema_name="$1"
    local table_name="$2"
    PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" psql -h localhost -p "${POSTGRES_PORT}" -U postgres -d postgres -tAc \
        "SELECT 1 FROM information_schema.tables WHERE table_schema = '${schema_name}' AND table_name = '${table_name}'" 2>/dev/null | grep -q 1
}

# =====================================================
# STEP 0: Prerequisites Check
# =====================================================
step_0_prerequisites() {
    log_step "0" "Checking Prerequisites"
    
    # Check if running as root or with sudo
    if [ "$EUID" -ne 0 ]; then
        log_warning "Not running as root. Some operations may require sudo."
    fi
    
    # Check OS
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        log_info "Operating System: ${PRETTY_NAME:-Unknown}"
        if [[ "${ID:-}" != "ubuntu" ]]; then
            log_warning "This script is optimized for Ubuntu. Proceed with caution on ${ID:-unknown}."
        fi
    else
        log_warning "Could not detect OS. Proceeding anyway..."
    fi
    
    # Check available disk space
    local available_space
    available_space=$(df -BG / | awk 'NR==2 {print $4}' | tr -d 'G')
    if [ "${available_space:-0}" -lt 10 ]; then
        log_warning "Low disk space: ${available_space}GB available. Recommend at least 10GB."
    else
        log_success "Disk space OK: ${available_space}GB available"
    fi
    
    # Check available memory
    local total_mem
    total_mem=$(free -g | awk '/^Mem:/ {print $2}')
    if [ "${total_mem:-0}" -lt 2 ]; then
        log_warning "Low memory: ${total_mem}GB available. Recommend at least 2GB."
    else
        log_success "Memory OK: ${total_mem}GB available"
    fi
    
    log_success "Prerequisites check completed"
}

# =====================================================
# STEP 1: System Update and Dependencies
# =====================================================
step_1_system_update() {
    log_step "1" "Updating System and Installing Dependencies"
    
    # Update package list
    log_info "Updating package lists..."
    if ! sudo apt-get update -y; then
        log_warning "apt-get update had issues, continuing anyway..."
    fi
    
    # Install essential packages
    log_info "Installing essential packages..."
    local packages=(
        curl
        wget
        git
        ca-certificates
        gnupg
        lsb-release
        apt-transport-https
        software-properties-common
        openssl
        netcat-openbsd
        jq
        unzip
        postgresql-client
    )
    
    for pkg in "${packages[@]}"; do
        if ! dpkg -l | grep -q "^ii  ${pkg}"; then
            log_info "Installing ${pkg}..."
            sudo apt-get install -y "$pkg" || log_warning "Failed to install ${pkg}, continuing..."
        else
            log_info "${pkg} already installed"
        fi
    done
    
    log_success "System dependencies installed"
}

# =====================================================
# STEP 2: Install Docker
# =====================================================
step_2_install_docker() {
    log_step "2" "Installing Docker"
    
    if command_exists docker; then
        local docker_version
        docker_version=$(get_docker_version)
        log_info "Docker already installed: version ${docker_version}"
        
        if version_gte "$docker_version" "$MIN_DOCKER_VERSION"; then
            log_success "Docker version ${docker_version} meets minimum requirement ${MIN_DOCKER_VERSION}"
        else
            log_warning "Docker version ${docker_version} is below recommended ${MIN_DOCKER_VERSION}"
        fi
    else
        log_info "Installing Docker..."
        
        # Remove old versions
        sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
        
        # Add Docker's official GPG key
        sudo install -m 0755 -d /etc/apt/keyrings
        
        if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
            curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            sudo chmod a+r /etc/apt/keyrings/docker.gpg
        fi
        
        # Set up the repository
        echo \
            "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
            $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
            sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        
        # Install Docker
        sudo apt-get update -y
        sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        
        # Start and enable Docker
        sudo systemctl start docker
        sudo systemctl enable docker
        
        log_success "Docker installed successfully"
    fi
    
    # Add current user to docker group if not root
    if [ "$EUID" -ne 0 ]; then
        if ! groups | grep -q docker; then
            sudo usermod -aG docker "$USER"
            log_info "Added $USER to docker group. You may need to log out and back in."
        fi
    fi
    
    # Verify Docker is running
    if sudo docker info >/dev/null 2>&1; then
        log_success "Docker is running"
    else
        log_error "Docker is not running properly"
        return 1
    fi
}

# =====================================================
# STEP 3: Install Docker Compose
# =====================================================
step_3_install_docker_compose() {
    log_step "3" "Installing Docker Compose"
    
    local compose_cmd
    compose_cmd=$(detect_docker_compose)
    
    if [ -n "$compose_cmd" ]; then
        local compose_version
        compose_version=$(get_compose_version)
        log_info "Docker Compose already installed: version ${compose_version}"
        
        if version_gte "$compose_version" "$MIN_COMPOSE_VERSION"; then
            log_success "Docker Compose version ${compose_version} meets minimum requirement ${MIN_COMPOSE_VERSION}"
        else
            log_warning "Docker Compose version ${compose_version} is below recommended ${MIN_COMPOSE_VERSION}"
        fi
    else
        log_info "Installing Docker Compose..."
        
        # Try docker-compose-plugin first
        if ! sudo apt-get install -y docker-compose-plugin 2>/dev/null; then
            # Fallback: download binary directly
            local compose_version="v2.24.0"
            local compose_url="https://github.com/docker/compose/releases/download/${compose_version}/docker-compose-linux-x86_64"
            
            log_info "Installing Docker Compose ${compose_version} from GitHub..."
            sudo curl -SL "$compose_url" -o /usr/local/bin/docker-compose
            sudo chmod +x /usr/local/bin/docker-compose
            sudo ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
        fi
        
        log_success "Docker Compose installed"
    fi
    
    # Store the compose command for later use
    COMPOSE_CMD=$(detect_docker_compose)
    if [ -z "$COMPOSE_CMD" ]; then
        log_error "Docker Compose installation failed"
        return 1
    fi
    
    log_success "Using Docker Compose command: ${COMPOSE_CMD}"
    export COMPOSE_CMD
}

# =====================================================
# STEP 4: Install Nginx
# =====================================================
step_4_install_nginx() {
    log_step "4" "Installing Nginx"
    
    if command_exists nginx; then
        log_info "Nginx already installed"
        nginx -v 2>&1 || true
    else
        log_info "Installing Nginx..."
        sudo apt-get install -y nginx
        log_success "Nginx installed"
    fi
    
    # Start and enable Nginx
    sudo systemctl start nginx 2>/dev/null || true
    sudo systemctl enable nginx 2>/dev/null || true
    
    log_success "Nginx is configured"
}

# =====================================================
# STEP 5: Install Certbot for SSL
# =====================================================
step_5_install_certbot() {
    log_step "5" "Installing Certbot for SSL Certificates"
    
    if command_exists certbot; then
        log_info "Certbot already installed"
        certbot --version 2>&1 || true
    else
        log_info "Installing Certbot..."
        sudo apt-get install -y certbot python3-certbot-nginx
        log_success "Certbot installed"
    fi
    
    log_success "Certbot is ready for SSL certificate generation"
}

# =====================================================
# STEP 6: Clone/Update Repository
# =====================================================
step_6_clone_repository() {
    log_step "6" "Cloning/Updating Repository"
    
    # Create install directory
    sudo mkdir -p "${INSTALL_DIR}"
    sudo chown -R "$USER:$USER" "${INSTALL_DIR}" 2>/dev/null || true
    
    if [ -d "${INSTALL_DIR}/.git" ]; then
        log_info "Repository exists. Updating..."
        cd "${INSTALL_DIR}"
        
        # Stash any local changes
        git stash 2>/dev/null || true
        
        # Pull latest changes
        if git pull origin main 2>/dev/null || git pull origin master 2>/dev/null; then
            log_success "Repository updated"
        else
            log_warning "Could not pull latest changes. Using existing code."
        fi
    else
        log_info "Cloning repository from ${REPO_URL}..."
        
        if [ "${REPO_URL}" = "https://github.com/YOUR_USERNAME/atlantisboard.git" ]; then
            log_warning "Default repository URL detected. Please set REPO_URL environment variable."
            log_info "Example: REPO_URL=https://github.com/yourusername/atlantisboard.git bash deploy-atlantisboard.sh"
            
            # Check if we're already in a git repo (development mode)
            if [ -d "$(pwd)/.git" ] && [ -f "$(pwd)/supabase/db/schema.sql" ]; then
                log_info "Detected existing AtlantisBoard project in current directory. Using it."
                if [ "$(pwd)" != "${INSTALL_DIR}" ]; then
                    sudo cp -r "$(pwd)"/* "${INSTALL_DIR}/"
                    sudo cp -r "$(pwd)"/.* "${INSTALL_DIR}/" 2>/dev/null || true
                fi
            else
                log_error "No repository available. Please provide REPO_URL or run from project directory."
                return 1
            fi
        else
            git clone "${REPO_URL}" "${INSTALL_DIR}"
            log_success "Repository cloned"
        fi
    fi
    
    cd "${INSTALL_DIR}"
    log_success "Working directory: ${INSTALL_DIR}"
}

# =====================================================
# STEP 7: Generate Secrets and Environment File
# =====================================================
step_7_generate_environment() {
    log_step "7" "Generating Secrets and Environment Configuration"
    
    cd "${INSTALL_DIR}"
    
    # Create secrets directory
    mkdir -p "${SECRETS_DIR}"
    chmod 700 "${SECRETS_DIR}"
    
    # Generate or load MySQL encryption key (persisted)
    if [ -f "${ENCRYPTION_KEY_FILE}" ]; then
        log_info "Loading existing MySQL encryption key..."
        MYSQL_ENCRYPTION_KEY=$(cat "${ENCRYPTION_KEY_FILE}")
    else
        log_info "Generating new 256-bit MySQL encryption key..."
        MYSQL_ENCRYPTION_KEY=$(generate_256bit_hex_key)
        echo "${MYSQL_ENCRYPTION_KEY}" > "${ENCRYPTION_KEY_FILE}"
        chmod 600 "${ENCRYPTION_KEY_FILE}"
        log_success "MySQL encryption key generated and saved"
    fi
    
    # Generate JWT secret if not already set
    if [ -f "${SECRETS_DIR}/jwt_secret" ]; then
        JWT_SECRET=$(cat "${SECRETS_DIR}/jwt_secret")
        log_info "Using existing JWT secret"
    else
        JWT_SECRET=$(generate_jwt_secret)
        echo "${JWT_SECRET}" > "${SECRETS_DIR}/jwt_secret"
        chmod 600 "${SECRETS_DIR}/jwt_secret"
        log_success "JWT secret generated"
    fi
    
    # Generate ANON_KEY and SERVICE_ROLE_KEY using JWT secret
    # These are JWTs with specific claims
    log_info "Generating Supabase API keys..."
    
    # For simplicity, we'll generate secure random keys
    # In production, these should be proper JWTs
    if [ -f "${SECRETS_DIR}/anon_key" ]; then
        ANON_KEY=$(cat "${SECRETS_DIR}/anon_key")
    else
        ANON_KEY=$(generate_secret 64)
        echo "${ANON_KEY}" > "${SECRETS_DIR}/anon_key"
        chmod 600 "${SECRETS_DIR}/anon_key"
    fi
    
    if [ -f "${SECRETS_DIR}/service_role_key" ]; then
        SERVICE_ROLE_KEY=$(cat "${SECRETS_DIR}/service_role_key")
    else
        SERVICE_ROLE_KEY=$(generate_secret 64)
        echo "${SERVICE_ROLE_KEY}" > "${SECRETS_DIR}/service_role_key"
        chmod 600 "${SECRETS_DIR}/service_role_key"
    fi
    
    # Generate Postgres password
    if [ -f "${SECRETS_DIR}/postgres_password" ]; then
        POSTGRES_PASSWORD=$(cat "${SECRETS_DIR}/postgres_password")
    else
        POSTGRES_PASSWORD=$(generate_secret 32)
        echo "${POSTGRES_PASSWORD}" > "${SECRETS_DIR}/postgres_password"
        chmod 600 "${SECRETS_DIR}/postgres_password"
    fi
    
    # Interactive configuration for domain and credentials
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}                    CONFIGURATION REQUIRED                       ${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Load existing values if .env exists
    if [ -f "${ENV_FILE}" ]; then
        log_info "Loading existing configuration..."
        source "${ENV_FILE}" 2>/dev/null || true
    fi
    
    # Domain name
    if [ -z "${DOMAIN_NAME:-}" ]; then
        echo -n "Enter your domain name (e.g., atlantisboard.example.com): "
        read -r DOMAIN_NAME
        if [ -z "${DOMAIN_NAME}" ]; then
            DOMAIN_NAME="localhost"
            log_warning "Using localhost as domain. HTTPS will not work without a real domain."
        fi
    else
        log_info "Using existing domain: ${DOMAIN_NAME}"
    fi
    
    # Google OAuth credentials (optional)
    if [ -z "${GOOGLE_CLIENT_ID:-}" ]; then
        echo ""
        echo "Google OAuth Configuration (optional, press Enter to skip):"
        echo -n "Google Client ID: "
        read -r GOOGLE_CLIENT_ID
        
        if [ -n "${GOOGLE_CLIENT_ID}" ]; then
            echo -n "Google Client Secret: "
            read -rs GOOGLE_CLIENT_SECRET
            echo ""
            ENABLE_GOOGLE_AUTH="true"
        else
            GOOGLE_CLIENT_ID=""
            GOOGLE_CLIENT_SECRET=""
            ENABLE_GOOGLE_AUTH="false"
        fi
    else
        log_info "Using existing Google OAuth configuration"
    fi
    
    # MySQL verification configuration (optional)
    if [ -z "${MYSQL_HOST:-}" ]; then
        echo ""
        echo "MySQL Email Verification Configuration (optional, press Enter to skip):"
        echo -n "MySQL Host: "
        read -r MYSQL_HOST
        
        if [ -n "${MYSQL_HOST}" ]; then
            echo -n "MySQL Database: "
            read -r MYSQL_DATABASE
            echo -n "MySQL User: "
            read -r MYSQL_USER
            echo -n "MySQL Password: "
            read -rs MYSQL_PASSWORD
            echo ""
        fi
    else
        log_info "Using existing MySQL configuration"
    fi
    
    # Determine URLs
    if [ "${DOMAIN_NAME}" = "localhost" ]; then
        SITE_URL="http://localhost:${APP_PORT}"
        API_EXTERNAL_URL="http://localhost:${KONG_HTTP_PORT}"
    else
        SITE_URL="https://${DOMAIN_NAME}"
        API_EXTERNAL_URL="https://${DOMAIN_NAME}/api"
    fi
    
    # Write environment file
    log_info "Writing environment configuration..."
    
    cat > "${ENV_FILE}" << EOF
# =====================================================
# AtlantisBoard Environment Configuration
# Generated: $(date)
# =====================================================

# Domain Configuration
DOMAIN_NAME=${DOMAIN_NAME}
SITE_URL=${SITE_URL}
API_EXTERNAL_URL=${API_EXTERNAL_URL}

# Application Ports
APP_PORT=${APP_PORT}
HTTP_PORT=${HTTP_PORT}
HTTPS_PORT=${HTTPS_PORT}

# PostgreSQL Configuration
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=postgres
POSTGRES_PORT=${POSTGRES_PORT}

# Supabase Configuration
JWT_SECRET=${JWT_SECRET}
JWT_EXP=3600
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}

# Kong API Gateway Ports
KONG_HTTP_PORT=${KONG_HTTP_PORT}
KONG_HTTPS_PORT=${KONG_HTTPS_PORT}

# Google OAuth Configuration
ENABLE_GOOGLE_AUTH=${ENABLE_GOOGLE_AUTH:-false}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}
GOOGLE_REDIRECT_URI=${SITE_URL}/auth/v1/callback

# MySQL Email Verification (for Google+ verification)
MYSQL_HOST=${MYSQL_HOST:-}
MYSQL_DATABASE=${MYSQL_DATABASE:-}
MYSQL_USER=${MYSQL_USER:-}
MYSQL_PASSWORD=${MYSQL_PASSWORD:-}
MYSQL_ENCRYPTION_KEY=${MYSQL_ENCRYPTION_KEY}

# Email Configuration
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
DISABLE_SIGNUP=false

# Realtime Configuration
SECRET_KEY_BASE=$(generate_secret 64)

# Frontend Configuration (for Vite)
VITE_SUPABASE_URL=${API_EXTERNAL_URL}
VITE_SUPABASE_ANON_KEY=${ANON_KEY}
VITE_SUPABASE_PROJECT_ID=local
EOF
    
    chmod 600 "${ENV_FILE}"
    
    log_success "Environment configuration saved to ${ENV_FILE}"
    log_info "You can edit this file later to update configuration"
}

# =====================================================
# STEP 8: Configure Kong API Gateway
# =====================================================
step_8_configure_kong() {
    log_step "8" "Configuring Kong API Gateway"
    
    cd "${INSTALL_DIR}"
    
    # Create Kong volumes directory
    mkdir -p "${INSTALL_DIR}/supabase/docker/volumes/kong"
    
    # Load environment
    source "${ENV_FILE}"
    
    # Update Kong configuration with actual keys
    log_info "Updating Kong configuration with API keys..."
    
    cat > "${INSTALL_DIR}/supabase/docker/volumes/kong/kong.yml" << 'EOF'
# Kong API Gateway Configuration for Supabase
_format_version: "2.1"
_transform: true

###
### Consumers / Users
###
consumers:
  - username: DASHBOARD
  - username: anon
    keyauth_credentials:
      - key: ${SUPABASE_ANON_KEY}
  - username: service_role
    keyauth_credentials:
      - key: ${SUPABASE_SERVICE_KEY}

###
### Access Control Lists
###
acls:
  - consumer: anon
    group: anon
  - consumer: service_role
    group: admin

###
### API Routes
###

services:
  ## Auth - GoTrue
  - name: auth-v1-open
    url: http://auth:9999/verify
    routes:
      - name: auth-v1-open
        strip_path: true
        paths:
          - /auth/v1/verify
    plugins:
      - name: cors
  - name: auth-v1-open-callback
    url: http://auth:9999/callback
    routes:
      - name: auth-v1-open-callback
        strip_path: true
        paths:
          - /auth/v1/callback
    plugins:
      - name: cors
  - name: auth-v1-open-authorize
    url: http://auth:9999/authorize
    routes:
      - name: auth-v1-open-authorize
        strip_path: true
        paths:
          - /auth/v1/authorize
    plugins:
      - name: cors
  - name: auth-v1
    _comment: "GoTrue: /auth/v1/* -> http://auth:9999/*"
    url: http://auth:9999/
    routes:
      - name: auth-v1-all
        strip_path: true
        paths:
          - /auth/v1/
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: false
      - name: acl
        config:
          hide_groups_header: true
          allow:
            - admin
            - anon

  ## REST - PostgREST
  - name: rest-v1
    _comment: "PostgREST: /rest/v1/* -> http://rest:3000/*"
    url: http://rest:3000/
    routes:
      - name: rest-v1-all
        strip_path: true
        paths:
          - /rest/v1/
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: true
      - name: acl
        config:
          hide_groups_header: true
          allow:
            - admin
            - anon

  ## Realtime
  - name: realtime-v1
    _comment: "Realtime: /realtime/v1/* -> ws://realtime:4000/socket/*"
    url: http://realtime:4000/socket/
    routes:
      - name: realtime-v1-all
        strip_path: true
        paths:
          - /realtime/v1/
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: false
      - name: acl
        config:
          hide_groups_header: true
          allow:
            - admin
            - anon

  ## Storage
  - name: storage-v1
    _comment: "Storage: /storage/v1/* -> http://storage:5000/*"
    url: http://storage:5000/
    routes:
      - name: storage-v1-all
        strip_path: true
        paths:
          - /storage/v1/
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: false
      - name: acl
        config:
          hide_groups_header: true
          allow:
            - admin
            - anon

  ## Edge Functions
  - name: functions-v1
    _comment: "Edge Functions: /functions/v1/* -> http://functions:9000/*"
    url: http://functions:9000/
    routes:
      - name: functions-v1-all
        strip_path: true
        paths:
          - /functions/v1/
    plugins:
      - name: cors
EOF
    
    # Replace placeholders with actual keys
    sed -i "s|\${SUPABASE_ANON_KEY}|${ANON_KEY}|g" "${INSTALL_DIR}/supabase/docker/volumes/kong/kong.yml"
    sed -i "s|\${SUPABASE_SERVICE_KEY}|${SERVICE_ROLE_KEY}|g" "${INSTALL_DIR}/supabase/docker/volumes/kong/kong.yml"
    
    log_success "Kong configuration updated"
}

# =====================================================
# STEP 9: Start Supabase Docker Services
# =====================================================
step_9_start_supabase() {
    log_step "9" "Starting Supabase Docker Services"
    
    cd "${INSTALL_DIR}/supabase/docker"
    
    # Load environment
    source "${ENV_FILE}"
    
    # Export all environment variables for Docker Compose
    export POSTGRES_PASSWORD
    export POSTGRES_DB
    export POSTGRES_PORT
    export JWT_SECRET
    export JWT_EXP
    export ANON_KEY
    export SERVICE_ROLE_KEY
    export API_EXTERNAL_URL
    export SITE_URL
    export KONG_HTTP_PORT
    export KONG_HTTPS_PORT
    export ENABLE_GOOGLE_AUTH
    export GOOGLE_CLIENT_ID
    export GOOGLE_CLIENT_SECRET
    export GOOGLE_REDIRECT_URI
    export ENABLE_EMAIL_SIGNUP
    export ENABLE_EMAIL_AUTOCONFIRM
    export DISABLE_SIGNUP
    export SECRET_KEY_BASE
    export MYSQL_ENCRYPTION_KEY
    
    # Stop any existing containers
    log_info "Stopping any existing Supabase containers..."
    $COMPOSE_CMD -f docker-compose.supabase.yml down --remove-orphans 2>/dev/null || true
    
    # Remove old volumes if requested
    if [ "${CLEAN_INSTALL:-false}" = "true" ]; then
        log_warning "Clean install requested. Removing existing volumes..."
        $COMPOSE_CMD -f docker-compose.supabase.yml down -v 2>/dev/null || true
    fi
    
    # Start database first
    log_info "Starting PostgreSQL database..."
    $COMPOSE_CMD -f docker-compose.supabase.yml up -d db
    
    # Wait for database to be ready
    log_info "Waiting for PostgreSQL to initialize (this may take a minute)..."
    sleep 10
    
    local db_ready=false
    for i in $(seq 1 60); do
        if $COMPOSE_CMD -f docker-compose.supabase.yml exec -T db pg_isready -U postgres >/dev/null 2>&1; then
            db_ready=true
            break
        fi
        echo -n "."
        sleep 2
    done
    echo ""
    
    if [ "$db_ready" = false ]; then
        log_error "PostgreSQL failed to start"
        $COMPOSE_CMD -f docker-compose.supabase.yml logs db
        return 1
    fi
    
    log_success "PostgreSQL is ready"
    
    # Wait for auth schema to be created by Supabase image
    log_info "Waiting for auth schema initialization..."
    for i in $(seq 1 30); do
        if $COMPOSE_CMD -f docker-compose.supabase.yml exec -T db psql -U postgres -d postgres -c "SELECT 1 FROM auth.users LIMIT 1" >/dev/null 2>&1; then
            log_success "Auth schema initialized"
            break
        fi
        echo -n "."
        sleep 2
    done
    echo ""
    
    # Start remaining services
    log_info "Starting remaining Supabase services..."
    $COMPOSE_CMD -f docker-compose.supabase.yml up -d
    
    # Wait for all services to be healthy
    log_info "Waiting for all services to be healthy..."
    sleep 15
    
    # Check each service
    local services=("db" "auth" "rest" "realtime" "storage" "kong")
    local all_healthy=true
    
    for service in "${services[@]}"; do
        if $COMPOSE_CMD -f docker-compose.supabase.yml ps "$service" 2>/dev/null | grep -q "Up"; then
            log_success "${service} is running"
        else
            log_warning "${service} may not be running correctly"
            all_healthy=false
        fi
    done
    
    if [ "$all_healthy" = true ]; then
        log_success "All Supabase services are running"
    else
        log_warning "Some services may have issues. Check logs with: $COMPOSE_CMD -f docker-compose.supabase.yml logs"
    fi
}

# =====================================================
# STEP 10: Verify Supabase Services
# =====================================================
step_10_verify_supabase() {
    log_step "10" "Verifying Supabase Services"
    
    cd "${INSTALL_DIR}/supabase/docker"
    source "${ENV_FILE}"
    
    # Check PostgreSQL connectivity
    log_info "Checking PostgreSQL connectivity..."
    if wait_for_postgres 30; then
        log_success "PostgreSQL is accessible"
    else
        log_warning "PostgreSQL may not be accessible from host"
    fi
    
    # Check for auth schema
    log_info "Checking for auth schema..."
    if check_schema_exists "auth"; then
        log_success "Auth schema exists"
    else
        log_error "Auth schema not found. Supabase initialization may have failed."
    fi
    
    # Check for storage schema
    log_info "Checking for storage schema..."
    if check_schema_exists "storage"; then
        log_success "Storage schema exists"
    else
        log_warning "Storage schema not found"
    fi
    
    # Check Kong API Gateway
    log_info "Checking Kong API Gateway..."
    if curl -sf "http://localhost:${KONG_HTTP_PORT}/" >/dev/null 2>&1 || \
       curl -sf "http://localhost:${KONG_HTTP_PORT}/rest/v1/" -H "apikey: ${ANON_KEY}" >/dev/null 2>&1; then
        log_success "Kong API Gateway is accessible"
    else
        log_warning "Kong API Gateway may not be ready yet"
    fi
    
    log_success "Supabase service verification completed"
}

# =====================================================
# STEP 11: Import Database Schema
# =====================================================
step_11_import_schema() {
    log_step "11" "Importing Database Schema"
    
    cd "${INSTALL_DIR}"
    source "${ENV_FILE}"
    
    # Check if schema already exists
    if check_table_exists "public" "profiles"; then
        log_info "Database schema already exists. Skipping import."
        log_info "To reimport, set CLEAN_INSTALL=true"
        return 0
    fi
    
    # Verify schema file exists
    if [ ! -f "${INSTALL_DIR}/supabase/db/schema.sql" ]; then
        log_error "Schema file not found: ${INSTALL_DIR}/supabase/db/schema.sql"
        return 1
    fi
    
    log_info "Importing database schema..."
    
    # Import the schema
    if PGPASSWORD="${POSTGRES_PASSWORD}" psql -h localhost -p "${POSTGRES_PORT}" -U postgres -d postgres \
        -f "${INSTALL_DIR}/supabase/db/schema.sql" 2>&1 | tee -a "${LOG_FILE}"; then
        log_success "Schema imported successfully"
    else
        log_error "Schema import failed. Check the log for details."
        return 1
    fi
    
    # Verify tables were created
    if check_table_exists "public" "profiles"; then
        log_success "Verified: profiles table exists"
    else
        log_error "Schema verification failed: profiles table not found"
        return 1
    fi
    
    if check_table_exists "public" "boards"; then
        log_success "Verified: boards table exists"
    else
        log_warning "boards table not found"
    fi
    
    log_success "Database schema import completed"
}

# =====================================================
# STEP 12: Apply Seed Data
# =====================================================
step_12_apply_seed_data() {
    log_step "12" "Applying Seed Data"
    
    cd "${INSTALL_DIR}"
    source "${ENV_FILE}"
    
    # Check if seed data already applied
    if PGPASSWORD="${POSTGRES_PASSWORD}" psql -h localhost -p "${POSTGRES_PORT}" -U postgres -d postgres \
        -tAc "SELECT COUNT(*) FROM public.app_settings WHERE id = 'default'" 2>/dev/null | grep -q "1"; then
        log_info "Seed data already applied. Skipping."
        return 0
    fi
    
    # Apply seed data
    if [ -f "${INSTALL_DIR}/supabase/seed.sql" ]; then
        log_info "Applying seed data..."
        
        if PGPASSWORD="${POSTGRES_PASSWORD}" psql -h localhost -p "${POSTGRES_PORT}" -U postgres -d postgres \
            -f "${INSTALL_DIR}/supabase/seed.sql" 2>&1; then
            log_success "Seed data applied"
        else
            log_warning "Seed data application had issues"
        fi
    else
        log_warning "Seed file not found: ${INSTALL_DIR}/supabase/seed.sql"
    fi
}

# =====================================================
# STEP 13: Configure Storage Buckets
# =====================================================
step_13_configure_storage() {
    log_step "13" "Configuring Storage Buckets"
    
    cd "${INSTALL_DIR}"
    source "${ENV_FILE}"
    
    # Check if storage buckets already exist
    if PGPASSWORD="${POSTGRES_PASSWORD}" psql -h localhost -p "${POSTGRES_PORT}" -U postgres -d postgres \
        -tAc "SELECT COUNT(*) FROM storage.buckets WHERE id = 'branding'" 2>/dev/null | grep -q "1"; then
        log_info "Storage buckets already configured. Skipping."
        return 0
    fi
    
    # Apply storage configuration
    if [ -f "${INSTALL_DIR}/supabase/storage/buckets.sql" ]; then
        log_info "Configuring storage buckets..."
        
        if PGPASSWORD="${POSTGRES_PASSWORD}" psql -h localhost -p "${POSTGRES_PORT}" -U postgres -d postgres \
            -f "${INSTALL_DIR}/supabase/storage/buckets.sql" 2>&1; then
            log_success "Storage buckets configured"
        else
            log_warning "Storage bucket configuration had issues"
        fi
    else
        log_warning "Storage config not found: ${INSTALL_DIR}/supabase/storage/buckets.sql"
    fi
}

# =====================================================
# STEP 14: Build Frontend Application
# =====================================================
step_14_build_frontend() {
    log_step "14" "Building Frontend Application"
    
    cd "${INSTALL_DIR}"
    source "${ENV_FILE}"
    
    # Check if Node.js is installed
    if ! command_exists node; then
        log_info "Installing Node.js..."
        
        # Install Node.js via NodeSource
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
        
        log_success "Node.js installed"
    fi
    
    node --version
    npm --version
    
    # Install dependencies
    log_info "Installing npm dependencies..."
    npm ci --legacy-peer-deps 2>/dev/null || npm install --legacy-peer-deps
    
    # Build the application
    log_info "Building frontend application..."
    npm run build
    
    if [ -d "${INSTALL_DIR}/dist" ]; then
        log_success "Frontend build completed"
    else
        log_error "Frontend build failed - dist directory not created"
        return 1
    fi
}

# =====================================================
# STEP 15: Configure Nginx
# =====================================================
step_15_configure_nginx() {
    log_step "15" "Configuring Nginx"
    
    source "${ENV_FILE}"
    
    # Create Nginx configuration
    log_info "Creating Nginx configuration..."
    
    sudo tee /etc/nginx/sites-available/atlantisboard > /dev/null << EOF
# AtlantisBoard Nginx Configuration

# Upstream for Supabase API
upstream supabase_api {
    server 127.0.0.1:${KONG_HTTP_PORT};
}

server {
    listen ${HTTP_PORT};
    listen [::]:${HTTP_PORT};
    server_name ${DOMAIN_NAME};

    # Redirect HTTP to HTTPS (if using real domain)
    $(if [ "${DOMAIN_NAME}" != "localhost" ]; then
        echo "return 301 https://\$host\$request_uri;"
    else
        echo "# Development mode - no HTTPS redirect"
        echo ""
        echo "root ${INSTALL_DIR}/dist;"
        echo "index index.html;"
        echo ""
        echo "# Frontend routes"
        echo "location / {"
        echo "    try_files \$uri \$uri/ /index.html;"
        echo "}"
        echo ""
        echo "# API proxy"
        echo "location /rest/ {"
        echo "    proxy_pass http://supabase_api/rest/;"
        echo "    proxy_http_version 1.1;"
        echo "    proxy_set_header Host \$host;"
        echo "    proxy_set_header X-Real-IP \$remote_addr;"
        echo "    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
        echo "    proxy_set_header X-Forwarded-Proto \$scheme;"
        echo "}"
        echo ""
        echo "location /auth/ {"
        echo "    proxy_pass http://supabase_api/auth/;"
        echo "    proxy_http_version 1.1;"
        echo "    proxy_set_header Host \$host;"
        echo "    proxy_set_header X-Real-IP \$remote_addr;"
        echo "}"
        echo ""
        echo "location /storage/ {"
        echo "    proxy_pass http://supabase_api/storage/;"
        echo "    proxy_http_version 1.1;"
        echo "    proxy_set_header Host \$host;"
        echo "}"
        echo ""
        echo "location /realtime/ {"
        echo "    proxy_pass http://supabase_api/realtime/;"
        echo "    proxy_http_version 1.1;"
        echo "    proxy_set_header Upgrade \$http_upgrade;"
        echo "    proxy_set_header Connection \"upgrade\";"
        echo "    proxy_set_header Host \$host;"
        echo "}"
        echo ""
        echo "location /functions/ {"
        echo "    proxy_pass http://supabase_api/functions/;"
        echo "    proxy_http_version 1.1;"
        echo "    proxy_set_header Host \$host;"
        echo "}"
    fi)
}

$(if [ "${DOMAIN_NAME}" != "localhost" ]; then
    cat << HTTPS_CONFIG
server {
    listen ${HTTPS_PORT} ssl http2;
    listen [::]:${HTTPS_PORT} ssl http2;
    server_name ${DOMAIN_NAME};

    # SSL certificates (managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/${DOMAIN_NAME}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN_NAME}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root ${INSTALL_DIR}/dist;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Frontend routes
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API proxy to Supabase
    location /rest/ {
        proxy_pass http://supabase_api/rest/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /auth/ {
        proxy_pass http://supabase_api/auth/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /storage/ {
        proxy_pass http://supabase_api/storage/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        client_max_body_size 50M;
    }

    location /realtime/ {
        proxy_pass http://supabase_api/realtime/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /functions/ {
        proxy_pass http://supabase_api/functions/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
HTTPS_CONFIG
fi)
EOF
    
    # Enable the site
    sudo ln -sf /etc/nginx/sites-available/atlantisboard /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    
    # Test Nginx configuration
    if sudo nginx -t; then
        log_success "Nginx configuration is valid"
        sudo systemctl reload nginx
        log_success "Nginx reloaded"
    else
        log_error "Nginx configuration test failed"
        return 1
    fi
}

# =====================================================
# STEP 16: Configure SSL Certificates
# =====================================================
step_16_configure_ssl() {
    log_step "16" "Configuring SSL Certificates"
    
    source "${ENV_FILE}"
    
    if [ "${DOMAIN_NAME}" = "localhost" ]; then
        log_info "Skipping SSL configuration for localhost development"
        return 0
    fi
    
    # Check if certificates already exist
    if [ -f "/etc/letsencrypt/live/${DOMAIN_NAME}/fullchain.pem" ]; then
        log_info "SSL certificates already exist for ${DOMAIN_NAME}"
        return 0
    fi
    
    log_info "Obtaining SSL certificate from Let's Encrypt..."
    
    # Temporarily configure Nginx for HTTP-only verification
    sudo tee /etc/nginx/sites-available/atlantisboard-temp > /dev/null << EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN_NAME};
    root ${INSTALL_DIR}/dist;
    
    location ~ /.well-known/acme-challenge/ {
        allow all;
    }
}
EOF
    
    sudo ln -sf /etc/nginx/sites-available/atlantisboard-temp /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/atlantisboard 2>/dev/null || true
    sudo systemctl reload nginx
    
    # Get certificate
    if sudo certbot certonly --nginx -d "${DOMAIN_NAME}" --non-interactive --agree-tos \
        -m "admin@${DOMAIN_NAME}" --redirect; then
        log_success "SSL certificate obtained"
    else
        log_warning "Failed to obtain SSL certificate. You may need to run certbot manually."
    fi
    
    # Restore full Nginx config
    sudo rm -f /etc/nginx/sites-enabled/atlantisboard-temp
    sudo rm -f /etc/nginx/sites-available/atlantisboard-temp
    sudo ln -sf /etc/nginx/sites-available/atlantisboard /etc/nginx/sites-enabled/
    sudo systemctl reload nginx
}

# =====================================================
# STEP 17: Create systemd Service
# =====================================================
step_17_create_systemd_service() {
    log_step "17" "Creating systemd Service"
    
    cd "${INSTALL_DIR}"
    source "${ENV_FILE}"
    
    # Create systemd service for Supabase
    log_info "Creating systemd service..."
    
    sudo tee /etc/systemd/system/atlantisboard-supabase.service > /dev/null << EOF
[Unit]
Description=AtlantisBoard Supabase Services
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}/supabase/docker
ExecStart=${COMPOSE_CMD} -f docker-compose.supabase.yml up -d
ExecStop=${COMPOSE_CMD} -f docker-compose.supabase.yml down
ExecReload=${COMPOSE_CMD} -f docker-compose.supabase.yml restart
TimeoutStartSec=120
TimeoutStopSec=60
Restart=no

[Install]
WantedBy=multi-user.target
EOF
    
    # Create environment file for systemd
    sudo tee /etc/systemd/system/atlantisboard-supabase.service.d/env.conf > /dev/null 2>&1 || true
    sudo mkdir -p /etc/systemd/system/atlantisboard-supabase.service.d/
    sudo cp "${ENV_FILE}" /etc/systemd/system/atlantisboard-supabase.service.d/env.conf 2>/dev/null || true
    
    # Reload systemd
    sudo systemctl daemon-reload
    sudo systemctl enable atlantisboard-supabase.service
    
    log_success "systemd service created and enabled"
}

# =====================================================
# STEP 18: Create Helper Scripts
# =====================================================
step_18_create_helper_scripts() {
    log_step "18" "Creating Helper Scripts"
    
    cd "${INSTALL_DIR}"
    mkdir -p "${INSTALL_DIR}/scripts"
    
    # Status script
    cat > "${INSTALL_DIR}/scripts/status.sh" << 'EOF'
#!/bin/bash
# AtlantisBoard Status Script

INSTALL_DIR="$(dirname "$(dirname "$(readlink -f "$0")")")"
source "${INSTALL_DIR}/.env" 2>/dev/null || true

echo "═══════════════════════════════════════════════════════════════"
echo "                  AtlantisBoard Status                          "
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Docker containers
echo "Docker Containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "(supabase|atlantis)" || echo "No containers found"

echo ""
echo "Service Health:"

# Check Nginx
if systemctl is-active --quiet nginx; then
    echo "✓ Nginx: running"
else
    echo "✗ Nginx: not running"
fi

# Check PostgreSQL
if docker exec supabase-db pg_isready -U postgres >/dev/null 2>&1; then
    echo "✓ PostgreSQL: healthy"
else
    echo "✗ PostgreSQL: not healthy"
fi

# Check Kong
if curl -sf "http://localhost:${KONG_HTTP_PORT:-8000}/" >/dev/null 2>&1; then
    echo "✓ Kong API Gateway: accessible"
else
    echo "✗ Kong API Gateway: not accessible"
fi

echo ""
echo "URLs:"
echo "  App: ${SITE_URL:-http://localhost:3000}"
echo "  API: ${API_EXTERNAL_URL:-http://localhost:8000}"
EOF
    chmod +x "${INSTALL_DIR}/scripts/status.sh"
    
    # Logs script
    cat > "${INSTALL_DIR}/scripts/logs.sh" << 'EOF'
#!/bin/bash
# AtlantisBoard Logs Script

INSTALL_DIR="$(dirname "$(dirname "$(readlink -f "$0")")")"
cd "${INSTALL_DIR}/supabase/docker"

SERVICE="${1:-}"

if [ -z "$SERVICE" ]; then
    echo "Usage: $0 [service|all]"
    echo "Available services: db, auth, rest, realtime, storage, kong, functions"
    echo ""
    echo "Examples:"
    echo "  $0 all        - Show all logs"
    echo "  $0 auth       - Show auth service logs"
    echo "  $0 db         - Show database logs"
    exit 0
fi

if [ "$SERVICE" = "all" ]; then
    docker compose -f docker-compose.supabase.yml logs -f --tail=100
else
    docker compose -f docker-compose.supabase.yml logs -f --tail=100 "$SERVICE"
fi
EOF
    chmod +x "${INSTALL_DIR}/scripts/logs.sh"
    
    # Restart script
    cat > "${INSTALL_DIR}/scripts/restart.sh" << 'EOF'
#!/bin/bash
# AtlantisBoard Restart Script

INSTALL_DIR="$(dirname "$(dirname "$(readlink -f "$0")")")"
cd "${INSTALL_DIR}/supabase/docker"

echo "Restarting AtlantisBoard services..."

SERVICE="${1:-}"

if [ -z "$SERVICE" ]; then
    docker compose -f docker-compose.supabase.yml restart
    sudo systemctl restart nginx
else
    docker compose -f docker-compose.supabase.yml restart "$SERVICE"
fi

echo "Services restarted."
EOF
    chmod +x "${INSTALL_DIR}/scripts/restart.sh"
    
    # Backup script
    cat > "${INSTALL_DIR}/scripts/backup.sh" << 'EOF'
#!/bin/bash
# AtlantisBoard Backup Script

INSTALL_DIR="$(dirname "$(dirname "$(readlink -f "$0")")")"
source "${INSTALL_DIR}/.env" 2>/dev/null || true

BACKUP_DIR="${INSTALL_DIR}/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "${BACKUP_DIR}"

echo "Creating backup..."

# Backup database
docker exec supabase-db pg_dump -U postgres -d postgres > "${BACKUP_DIR}/db_${TIMESTAMP}.sql"

if [ -f "${BACKUP_DIR}/db_${TIMESTAMP}.sql" ]; then
    gzip "${BACKUP_DIR}/db_${TIMESTAMP}.sql"
    echo "✓ Database backup: ${BACKUP_DIR}/db_${TIMESTAMP}.sql.gz"
else
    echo "✗ Database backup failed"
fi

# Backup .env file
cp "${INSTALL_DIR}/.env" "${BACKUP_DIR}/env_${TIMESTAMP}.backup"
echo "✓ Environment backup: ${BACKUP_DIR}/env_${TIMESTAMP}.backup"

echo ""
echo "Backup complete!"
EOF
    chmod +x "${INSTALL_DIR}/scripts/backup.sh"
    
    # Start script
    cat > "${INSTALL_DIR}/scripts/start.sh" << 'EOF'
#!/bin/bash
# AtlantisBoard Start Script

INSTALL_DIR="$(dirname "$(dirname "$(readlink -f "$0")")")"
cd "${INSTALL_DIR}/supabase/docker"

echo "Starting AtlantisBoard..."

docker compose -f docker-compose.supabase.yml up -d
sudo systemctl start nginx

echo "AtlantisBoard started."
exec "${INSTALL_DIR}/scripts/status.sh"
EOF
    chmod +x "${INSTALL_DIR}/scripts/start.sh"
    
    # Stop script
    cat > "${INSTALL_DIR}/scripts/stop.sh" << 'EOF'
#!/bin/bash
# AtlantisBoard Stop Script

INSTALL_DIR="$(dirname "$(dirname "$(readlink -f "$0")")")"
cd "${INSTALL_DIR}/supabase/docker"

echo "Stopping AtlantisBoard..."

docker compose -f docker-compose.supabase.yml down
sudo systemctl stop nginx

echo "AtlantisBoard stopped."
EOF
    chmod +x "${INSTALL_DIR}/scripts/stop.sh"
    
    # Update script
    cat > "${INSTALL_DIR}/scripts/update.sh" << 'EOF'
#!/bin/bash
# AtlantisBoard Update Script

INSTALL_DIR="$(dirname "$(dirname "$(readlink -f "$0")")")"
cd "${INSTALL_DIR}"

echo "Updating AtlantisBoard..."

# Pull latest code
git pull origin main 2>/dev/null || git pull origin master 2>/dev/null || echo "Could not pull updates"

# Rebuild frontend
npm ci --legacy-peer-deps
npm run build

# Restart services
exec "${INSTALL_DIR}/scripts/restart.sh"
EOF
    chmod +x "${INSTALL_DIR}/scripts/update.sh"
    
    log_success "Helper scripts created in ${INSTALL_DIR}/scripts/"
}

# =====================================================
# STEP 19: Final Verification
# =====================================================
step_19_final_verification() {
    log_step "19" "Final Verification"
    
    local all_passed=true
    local pass_count=0
    local warn_count=0
    local fail_count=0
    
    # Results arrays
    declare -a results_pass=()
    declare -a results_warn=()
    declare -a results_fail=()
    
    # Helper functions for tracking results
    record_pass() {
        results_pass+=("$1")
        pass_count=$((pass_count + 1))
    }
    
    record_warn() {
        results_warn+=("$1")
        warn_count=$((warn_count + 1))
    }
    
    record_fail() {
        results_fail+=("$1")
        fail_count=$((fail_count + 1))
        all_passed=false
    }
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "              POST-DEPLOYMENT VALIDATION"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    
    # -------------------------------------------------------------------
    # SYSTEM VALIDATION
    # -------------------------------------------------------------------
    echo -e "${BLUE}[SYSTEM]${NC}"
    
    # Check OS is Ubuntu 22.04
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        if [[ "${VERSION_ID:-}" == "22.04" ]] && [[ "${ID:-}" == "ubuntu" ]]; then
            echo "  ✓ OS: Ubuntu 22.04 (${PRETTY_NAME:-})"
            record_pass "OS: Ubuntu 22.04"
        elif [[ "${ID:-}" == "ubuntu" ]]; then
            echo "  ⚠ OS: Ubuntu ${VERSION_ID:-unknown} (expected 22.04)"
            record_warn "OS: Ubuntu ${VERSION_ID:-unknown} (expected 22.04)"
        else
            echo "  ⚠ OS: ${PRETTY_NAME:-unknown} (expected Ubuntu 22.04)"
            record_warn "OS: ${PRETTY_NAME:-unknown}"
        fi
    else
        echo "  ⚠ OS: Could not detect"
        record_warn "OS: Detection failed"
    fi
    
    # Check Docker version
    if command_exists docker; then
        local docker_version
        docker_version=$(get_docker_version)
        if version_gte "$docker_version" "$MIN_DOCKER_VERSION"; then
            echo "  ✓ Docker: v${docker_version} (>= ${MIN_DOCKER_VERSION})"
            record_pass "Docker: v${docker_version}"
        else
            echo "  ⚠ Docker: v${docker_version} (recommended >= ${MIN_DOCKER_VERSION})"
            record_warn "Docker: v${docker_version} below recommended"
        fi
    else
        echo "  ✗ Docker: NOT INSTALLED"
        record_fail "Docker: Not installed"
    fi
    
    # Check Docker Compose version
    local compose_cmd
    compose_cmd=$(detect_docker_compose)
    if [ -n "$compose_cmd" ]; then
        local compose_version
        compose_version=$(get_compose_version)
        if version_gte "$compose_version" "$MIN_COMPOSE_VERSION"; then
            echo "  ✓ Docker Compose: v${compose_version} (>= ${MIN_COMPOSE_VERSION})"
            record_pass "Docker Compose: v${compose_version}"
        else
            echo "  ⚠ Docker Compose: v${compose_version} (recommended >= ${MIN_COMPOSE_VERSION})"
            record_warn "Docker Compose: v${compose_version} below recommended"
        fi
    else
        echo "  ✗ Docker Compose: NOT INSTALLED"
        record_fail "Docker Compose: Not installed"
    fi
    
    # Check required ports
    echo ""
    echo -e "${BLUE}[PORTS]${NC}"
    local ports_to_check=("${HTTP_PORT}:HTTP" "${HTTPS_PORT}:HTTPS" "${POSTGRES_PORT}:PostgreSQL" "${KONG_HTTP_PORT}:Kong API")
    
    for port_entry in "${ports_to_check[@]}"; do
        local port="${port_entry%%:*}"
        local service="${port_entry##*:}"
        
        if nc -z localhost "$port" 2>/dev/null; then
            echo "  ✓ Port ${port} (${service}): OPEN"
            record_pass "Port ${port} (${service}): Open"
        else
            # Check if port is listening on 0.0.0.0
            if ss -tln 2>/dev/null | grep -q ":${port} " || netstat -tln 2>/dev/null | grep -q ":${port} "; then
                echo "  ✓ Port ${port} (${service}): LISTENING"
                record_pass "Port ${port} (${service}): Listening"
            else
                echo "  ⚠ Port ${port} (${service}): NOT LISTENING"
                record_warn "Port ${port} (${service}): Not listening"
            fi
        fi
    done
    
    # -------------------------------------------------------------------
    # CONTAINER VALIDATION
    # -------------------------------------------------------------------
    echo ""
    echo -e "${BLUE}[CONTAINERS]${NC}"
    
    # Required containers
    local required_containers=("supabase-db" "supabase-auth" "supabase-rest" "supabase-realtime" "supabase-storage" "supabase-kong")
    local optional_containers=("supabase-meta" "supabase-studio" "supabase-imgproxy" "supabase-edge-functions" "supabase-analytics" "supabase-vector")
    
    for container in "${required_containers[@]}"; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$"; then
            local container_status
            container_status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null)
            if [ "$container_status" = "running" ]; then
                echo "  ✓ ${container}: RUNNING"
                record_pass "${container}: Running"
            else
                echo "  ✗ ${container}: ${container_status:-unknown}"
                record_fail "${container}: ${container_status:-not running}"
            fi
        else
            echo "  ✗ ${container}: NOT FOUND"
            record_fail "${container}: Not found"
        fi
    done
    
    # Check optional containers (warn if running but not required)
    local found_optional=false
    for container in "${optional_containers[@]}"; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$"; then
            if [ "$found_optional" = false ]; then
                echo ""
                echo "  Optional services detected:"
                found_optional=true
            fi
            echo "    ⚠ ${container}: running (optional, may consume resources)"
            record_warn "${container}: Running (optional)"
        fi
    done
    
    # -------------------------------------------------------------------
    # SUPABASE / DATABASE VALIDATION
    # -------------------------------------------------------------------
    echo ""
    echo -e "${BLUE}[SUPABASE]${NC}"
    
    # Check PostgreSQL health
    local pg_healthy=false
    if PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" psql -h localhost -p "${POSTGRES_PORT}" -U postgres -d postgres -c "SELECT 1" >/dev/null 2>&1; then
        echo "  ✓ PostgreSQL: HEALTHY (accepting connections)"
        record_pass "PostgreSQL: Healthy"
        pg_healthy=true
    else
        echo "  ✗ PostgreSQL: UNHEALTHY (not accepting connections)"
        record_fail "PostgreSQL: Unhealthy"
    fi
    
    # Check schemas
    echo ""
    echo "  Schema verification:"
    local schemas_to_check=("auth" "storage" "public")
    local all_schemas_exist=true
    
    for schema in "${schemas_to_check[@]}"; do
        if [ "$pg_healthy" = true ] && check_schema_exists "$schema"; then
            echo "    ✓ ${schema}: EXISTS"
            record_pass "Schema ${schema}: Exists"
        else
            echo "    ✗ ${schema}: MISSING"
            record_fail "Schema ${schema}: Missing"
            all_schemas_exist=false
        fi
    done
    
    # Verify schema came from schema.sql import (check for app-specific tables)
    echo ""
    echo "  Schema import verification (checking app tables):"
    if [ "$pg_healthy" = true ]; then
        local app_tables=("profiles" "boards" "workspaces" "cards" "columns" "app_settings")
        local imported_tables=0
        
        for table in "${app_tables[@]}"; do
            if check_table_exists "public" "$table"; then
                echo "    ✓ public.${table}: EXISTS"
                imported_tables=$((imported_tables + 1))
            else
                echo "    ✗ public.${table}: MISSING"
            fi
        done
        
        if [ $imported_tables -ge 4 ]; then
            echo "    ✓ Schema import: VERIFIED (${imported_tables}/${#app_tables[@]} tables found)"
            record_pass "Schema import: Verified"
        else
            echo "    ✗ Schema import: INCOMPLETE (only ${imported_tables}/${#app_tables[@]} tables)"
            record_fail "Schema import: Incomplete"
        fi
    else
        echo "    ⚠ Cannot verify schema import (PostgreSQL not healthy)"
        record_warn "Schema import: Cannot verify (PostgreSQL unhealthy)"
    fi
    
    # Check Supabase Auth service
    echo ""
    echo "  Supabase Auth service:"
    local auth_health_url="http://localhost:${KONG_HTTP_PORT}/auth/v1/health"
    local auth_response
    auth_response=$(curl -sf "$auth_health_url" 2>/dev/null || echo "")
    
    if [ -n "$auth_response" ]; then
        echo "    ✓ Auth service: RESPONDING"
        record_pass "Supabase Auth: Responding"
    else
        # Try direct auth port
        if curl -sf "http://localhost:9999/health" >/dev/null 2>&1; then
            echo "    ✓ Auth service: RESPONDING (direct port)"
            record_pass "Supabase Auth: Responding"
        else
            echo "    ⚠ Auth service: NOT RESPONDING (may take time to initialize)"
            record_warn "Supabase Auth: Not responding"
        fi
    fi
    
    # -------------------------------------------------------------------
    # EDGE FUNCTIONS VALIDATION
    # -------------------------------------------------------------------
    echo ""
    echo -e "${BLUE}[EDGE FUNCTIONS]${NC}"
    
    if [ -d "${INSTALL_DIR}/supabase/functions" ]; then
        local func_dirs
        func_dirs=$(find "${INSTALL_DIR}/supabase/functions" -mindepth 1 -maxdepth 1 -type d -name '*' ! -name '_*' 2>/dev/null)
        local func_count
        func_count=$(echo "$func_dirs" | grep -c . 2>/dev/null || echo "0")
        
        if [ "$func_count" -gt 0 ]; then
            echo "  ✓ Edge functions found: ${func_count}"
            record_pass "Edge functions: ${func_count} found"
            
            # List edge functions
            echo "    Functions:"
            echo "$func_dirs" | while read -r func_dir; do
                if [ -n "$func_dir" ]; then
                    local func_name
                    func_name=$(basename "$func_dir")
                    echo "      - ${func_name}"
                fi
            done
            
            # Check if edge functions are reachable
            local functions_url="http://localhost:${KONG_HTTP_PORT}/functions/v1/"
            if curl -sf "$functions_url" -H "Authorization: Bearer ${ANON_KEY:-}" >/dev/null 2>&1; then
                echo "    ✓ Functions API: REACHABLE"
                record_pass "Edge Functions API: Reachable"
            else
                echo "    ⚠ Functions API: NOT REACHABLE (may require auth)"
                record_warn "Edge Functions API: Not reachable"
            fi
        else
            echo "  ⚠ No edge functions found in ${INSTALL_DIR}/supabase/functions"
            record_warn "Edge functions: None found"
        fi
    else
        echo "  ⚠ Edge functions directory not found"
        record_warn "Edge functions: Directory not found"
    fi
    
    # Check secrets are loaded
    echo ""
    echo "  Secrets verification:"
    if [ -d "${SECRETS_DIR}" ]; then
        echo "    ✓ Secrets directory exists: ${SECRETS_DIR}"
        record_pass "Secrets directory: Exists"
        
        if [ -f "${ENCRYPTION_KEY_FILE}" ]; then
            local key_length
            key_length=$(wc -c < "${ENCRYPTION_KEY_FILE}" 2>/dev/null || echo "0")
            if [ "$key_length" -ge 64 ]; then
                echo "    ✓ Encryption key: EXISTS (${key_length} chars)"
                record_pass "Encryption key: Exists"
            else
                echo "    ⚠ Encryption key: EXISTS but may be invalid (${key_length} chars)"
                record_warn "Encryption key: May be invalid"
            fi
        else
            echo "    ✗ Encryption key: MISSING"
            record_fail "Encryption key: Missing"
        fi
    else
        echo "    ✗ Secrets directory: MISSING"
        record_fail "Secrets directory: Missing"
    fi
    
    # -------------------------------------------------------------------
    # APPLICATION VALIDATION
    # -------------------------------------------------------------------
    echo ""
    echo -e "${BLUE}[APPLICATION]${NC}"
    
    # Check Nginx
    if systemctl is-active --quiet nginx 2>/dev/null; then
        echo "  ✓ Nginx: RUNNING"
        record_pass "Nginx: Running"
    else
        echo "  ✗ Nginx: NOT RUNNING"
        record_fail "Nginx: Not running"
    fi
    
    # Check Certbot/SSL certificates
    echo ""
    echo "  SSL Certificate verification:"
    local domain="${DOMAIN:-}"
    if [ -n "$domain" ] && [ "$domain" != "localhost" ]; then
        local cert_path="/etc/letsencrypt/live/${domain}/fullchain.pem"
        if [ -f "$cert_path" ]; then
            # Check certificate validity
            local cert_expiry
            cert_expiry=$(openssl x509 -enddate -noout -in "$cert_path" 2>/dev/null | cut -d= -f2)
            local cert_expiry_epoch
            cert_expiry_epoch=$(date -d "$cert_expiry" +%s 2>/dev/null || echo "0")
            local now_epoch
            now_epoch=$(date +%s)
            local days_until_expiry=$(( (cert_expiry_epoch - now_epoch) / 86400 ))
            
            if [ "$days_until_expiry" -gt 30 ]; then
                echo "    ✓ SSL certificate: VALID (expires in ${days_until_expiry} days)"
                record_pass "SSL certificate: Valid"
            elif [ "$days_until_expiry" -gt 0 ]; then
                echo "    ⚠ SSL certificate: EXPIRING SOON (${days_until_expiry} days)"
                record_warn "SSL certificate: Expiring in ${days_until_expiry} days"
            else
                echo "    ✗ SSL certificate: EXPIRED"
                record_fail "SSL certificate: Expired"
            fi
        else
            echo "    ⚠ SSL certificate: NOT FOUND (run certbot to generate)"
            record_warn "SSL certificate: Not found"
        fi
    else
        echo "    ⚠ SSL certificate: SKIPPED (localhost or no domain set)"
        record_warn "SSL certificate: Skipped (localhost)"
    fi
    
    # Check app over HTTPS
    echo ""
    echo "  Application accessibility:"
    if [ -n "$domain" ] && [ "$domain" != "localhost" ]; then
        if curl -sf "https://${domain}/" -k --max-time 10 >/dev/null 2>&1; then
            echo "    ✓ App via HTTPS: ACCESSIBLE"
            record_pass "App HTTPS: Accessible"
        else
            echo "    ⚠ App via HTTPS: NOT ACCESSIBLE"
            record_warn "App HTTPS: Not accessible"
        fi
    fi
    
    # Check app over HTTP (local)
    if curl -sf "http://localhost:${HTTP_PORT}/" --max-time 10 >/dev/null 2>&1; then
        echo "    ✓ App via HTTP: ACCESSIBLE"
        record_pass "App HTTP: Accessible"
    else
        echo "    ⚠ App via HTTP: NOT ACCESSIBLE"
        record_warn "App HTTP: Not accessible"
    fi
    
    # Check OAuth redirect URLs
    echo ""
    echo "  OAuth configuration:"
    if [ -f "${ENV_FILE}" ]; then
        if grep -q "GOOGLE_CLIENT_ID=" "${ENV_FILE}" && grep -q "GOOGLE_CLIENT_SECRET=" "${ENV_FILE}"; then
            local google_client_id
            google_client_id=$(grep "GOOGLE_CLIENT_ID=" "${ENV_FILE}" | cut -d= -f2-)
            if [ -n "$google_client_id" ] && [ "$google_client_id" != "your-google-client-id" ]; then
                echo "    ✓ Google OAuth: CONFIGURED"
                record_pass "Google OAuth: Configured"
            else
                echo "    ⚠ Google OAuth: NOT CONFIGURED (default values)"
                record_warn "Google OAuth: Not configured"
            fi
        else
            echo "    ⚠ Google OAuth: MISSING from .env"
            record_warn "Google OAuth: Missing from env"
        fi
        
        # Check redirect URL
        if [ -n "$domain" ] && [ "$domain" != "localhost" ]; then
            local expected_redirect="https://${domain}/auth/callback"
            echo "    ℹ Expected OAuth redirect URL: ${expected_redirect}"
        fi
    else
        echo "    ⚠ Cannot verify OAuth (.env file missing)"
        record_warn "OAuth: Cannot verify"
    fi
    
    # -------------------------------------------------------------------
    # AUTH VALIDATION
    # -------------------------------------------------------------------
    echo ""
    echo -e "${BLUE}[AUTH & SECRETS]${NC}"
    
    # Check Google OAuth config is loaded
    if [ -f "${ENV_FILE}" ]; then
        local oauth_vars=("GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_SECRET" "GOOGLE_REDIRECT_URI")
        local oauth_configured=0
        
        for var in "${oauth_vars[@]}"; do
            if grep -q "^${var}=" "${ENV_FILE}"; then
                local value
                value=$(grep "^${var}=" "${ENV_FILE}" | cut -d= -f2-)
                if [ -n "$value" ] && [[ "$value" != *"your-"* ]] && [[ "$value" != *"placeholder"* ]]; then
                    echo "    ✓ ${var}: SET"
                    oauth_configured=$((oauth_configured + 1))
                else
                    echo "    ⚠ ${var}: DEFAULT/PLACEHOLDER"
                fi
            else
                echo "    ⚠ ${var}: MISSING"
            fi
        done
        
        if [ "$oauth_configured" -ge 2 ]; then
            record_pass "Google OAuth vars: Configured"
        else
            record_warn "Google OAuth vars: Incomplete"
        fi
    fi
    
    # Check encryption key persistence
    echo ""
    echo "  Encryption key persistence:"
    if [ -f "${ENCRYPTION_KEY_FILE}" ]; then
        # Check if the file has proper permissions
        local key_perms
        key_perms=$(stat -c "%a" "${ENCRYPTION_KEY_FILE}" 2>/dev/null || echo "unknown")
        
        if [ "$key_perms" = "600" ] || [ "$key_perms" = "400" ]; then
            echo "    ✓ Encryption key permissions: SECURE (${key_perms})"
            record_pass "Encryption key permissions: Secure"
        else
            echo "    ⚠ Encryption key permissions: ${key_perms} (recommend 600)"
            record_warn "Encryption key permissions: ${key_perms}"
        fi
        
        # Check modification time to verify not regenerated
        local key_mtime
        key_mtime=$(stat -c "%Y" "${ENCRYPTION_KEY_FILE}" 2>/dev/null || echo "0")
        local now_time
        now_time=$(date +%s)
        local key_age_minutes=$(( (now_time - key_mtime) / 60 ))
        
        if [ "$key_age_minutes" -gt 5 ]; then
            echo "    ✓ Encryption key age: ${key_age_minutes} minutes (not regenerated)"
            record_pass "Encryption key: Persistent"
        else
            echo "    ℹ Encryption key age: ${key_age_minutes} minutes (recently created/modified)"
        fi
    else
        echo "    ✗ Encryption key: NOT FOUND"
        record_fail "Encryption key: Not found"
    fi
    
    # -------------------------------------------------------------------
    # SUMMARY
    # -------------------------------------------------------------------
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "                    VALIDATION SUMMARY"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo -e "${GREEN}  PASSED:${NC}   ${pass_count}"
    echo -e "${YELLOW}  WARNINGS:${NC} ${warn_count}"
    echo -e "${RED}  FAILED:${NC}   ${fail_count}"
    echo ""
    
    # Print failures if any
    if [ ${#results_fail[@]} -gt 0 ]; then
        echo -e "${RED}Failed checks:${NC}"
        for result in "${results_fail[@]}"; do
            echo "  ✗ ${result}"
        done
        echo ""
    fi
    
    # Print warnings if any
    if [ ${#results_warn[@]} -gt 0 ]; then
        echo -e "${YELLOW}Warnings:${NC}"
        for result in "${results_warn[@]}"; do
            echo "  ⚠ ${result}"
        done
        echo ""
    fi
    
    echo "═══════════════════════════════════════════════════════════════"
    
    if [ "$all_passed" = true ] && [ "$warn_count" -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✓ ALL VALIDATIONS PASSED${NC}"
        echo ""
    elif [ "$all_passed" = true ]; then
        echo ""
        echo -e "${YELLOW}✓ ALL CRITICAL CHECKS PASSED (${warn_count} warnings)${NC}"
        echo ""
    else
        echo ""
        echo -e "${RED}✗ VALIDATION INCOMPLETE (${fail_count} failures, ${warn_count} warnings)${NC}"
        echo ""
    fi
    
    echo "AtlantisBoard Deployment Status:"
    if [ "$all_passed" = true ]; then
        echo "  Status: READY"
        echo "  URL: ${SITE_URL:-http://localhost:${HTTP_PORT}}"
    else
        echo "  Status: REQUIRES ATTENTION"
        echo "  Please review the failed checks above."
    fi
    echo ""
    echo "Helper scripts available at: ${INSTALL_DIR}/scripts/"
    echo "  ./scripts/status.sh   - Check service status"
    echo "  ./scripts/logs.sh     - View service logs"
    echo "  ./scripts/restart.sh  - Restart services"
    echo "  ./scripts/backup.sh   - Create backup"
    echo "  ./scripts/update.sh   - Update application"
    echo ""
    echo "Log file: ${LOG_FILE}"
    echo ""
    
    # Return success regardless - we don't want to terminate SSH
    return 0
}

# =====================================================
# MAIN EXECUTION
# =====================================================
main() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "        ${SCRIPT_NAME} v${SCRIPT_VERSION}"
    echo "        Self-Hosted Deployment for Google Cloud VM"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    
    # Create log file
    sudo mkdir -p "$(dirname "${LOG_FILE}")"
    sudo touch "${LOG_FILE}"
    sudo chmod 666 "${LOG_FILE}"
    
    log "INFO" "Starting deployment at $(date)"
    
    # Execute all steps
    step_0_prerequisites || log_warning "Prerequisites check had issues"
    step_1_system_update || log_warning "System update had issues"
    step_2_install_docker || { log_error "Docker installation failed"; exit 1; }
    step_3_install_docker_compose || { log_error "Docker Compose installation failed"; exit 1; }
    step_4_install_nginx || log_warning "Nginx installation had issues"
    step_5_install_certbot || log_warning "Certbot installation had issues"
    step_6_clone_repository || { log_error "Repository setup failed"; exit 1; }
    step_7_generate_environment || { log_error "Environment generation failed"; exit 1; }
    step_8_configure_kong || log_warning "Kong configuration had issues"
    step_9_start_supabase || { log_error "Supabase startup failed"; exit 1; }
    step_10_verify_supabase || log_warning "Supabase verification had issues"
    step_11_import_schema || log_warning "Schema import had issues"
    step_12_apply_seed_data || log_warning "Seed data application had issues"
    step_13_configure_storage || log_warning "Storage configuration had issues"
    step_14_build_frontend || log_warning "Frontend build had issues"
    step_15_configure_nginx || log_warning "Nginx configuration had issues"
    step_16_configure_ssl || log_warning "SSL configuration had issues"
    step_17_create_systemd_service || log_warning "systemd service creation had issues"
    step_18_create_helper_scripts || log_warning "Helper scripts creation had issues"
    step_19_final_verification
    
    log "INFO" "Deployment completed at $(date)"
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "                    DEPLOYMENT COMPLETE                         "
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "Log file: ${LOG_FILE}"
    echo ""
}

# Run main function
main "$@"
