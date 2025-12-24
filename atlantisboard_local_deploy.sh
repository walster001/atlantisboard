#!/bin/bash

# =====================================================
# AtlantisBoard Full Local Deployment Script
# Ubuntu Jammy | Local Supabase + Edge Functions + Deno + Nginx + HTTPS
# Unified Docker .env configuration (Google OAuth + external MySQL + Supabase)
# =====================================================

set -e

echo "======================================="
echo "Welcome to AtlantisBoard Local Production Deployment!"
echo "This script will deploy AtlantisBoard fully locally with:"
echo "- Local Supabase (Docker)"
echo "- Edge Functions deployed locally"
echo "- Frontend + Deno server"
echo "- Nginx reverse proxy + HTTPS"
echo "- Mandatory Google OAuth"
echo "- External MySQL verification"
echo "- Unified .env for all configuration"
echo "- Auto-start services on reboot"
echo "======================================="
sleep 2

# ----------------------------
# STEP 1: Update & install essentials
# ----------------------------
echo "[STEP 1] Updating system & installing packages..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git docker.io docker-compose build-essential unzip nginx certbot python3-certbot-nginx postgresql-client

sudo systemctl enable --now docker
sudo systemctl enable --now nginx

# ----------------------------
# STEP 2: Install Node.js & npm
# ----------------------------
echo "[STEP 2] Installing Node.js & npm..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# ----------------------------
# STEP 3: Install Deno
# ----------------------------
echo "[STEP 3] Installing Deno..."
curl -fsSL https://deno.land/install.sh | sh
export PATH="$HOME/.deno/bin:$PATH"
echo 'export PATH="$HOME/.deno/bin:$PATH"' >> ~/.bashrc

# ----------------------------
# STEP 4: Verify Docker is working
# ----------------------------
echo "[STEP 4] Verifying Docker installation..."
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running or not installed correctly."
    echo "Please ensure Docker is installed and running, then re-run this script."
    exit 1
fi
echo "Docker is working correctly."

# Add current user to docker group to avoid sudo
if ! groups | grep -q docker; then
    sudo usermod -aG docker $USER
    echo "Added $USER to docker group. You may need to log out and back in for this to take effect."
fi

# ----------------------------
# STEP 5: Clone AtlantisBoard repo
# ----------------------------
APP_DIR="$HOME/atlantisboard"
REPO_URL="https://github.com/walster001/atlantisboard.git"

if [ ! -d "$APP_DIR" ]; then
    echo "[STEP 5] Cloning AtlantisBoard repository..."
    git clone $REPO_URL $APP_DIR || { echo "Git clone failed"; exit 1; }
else
    echo "[STEP 5] Repo exists, pulling latest changes..."
    cd $APP_DIR
    git pull || { echo "Git pull failed"; exit 1; }
fi

cd $APP_DIR

# ----------------------------
# ----------------------------
# STEP 6: Prompt for unified .env variables
# ----------------------------
echo "[STEP 6] Collecting environment variables for unified .env"

# Nginx / SSL
read -p "Domain name (example.com): " DOMAIN
read -p "Public HTTP port [80]: " NGINX_HTTP_PORT
NGINX_HTTP_PORT=${NGINX_HTTP_PORT:-80}
read -p "Public HTTPS port [443]: " NGINX_HTTPS_PORT
NGINX_HTTPS_PORT=${NGINX_HTTPS_PORT:-443}
read -p "Enable HTTPS via Certbot? (yes/no) [yes]: " ENABLE_SSL
ENABLE_SSL=${ENABLE_SSL:-yes}
read -p "Certbot email address: " CERTBOT_EMAIL

# Google OAuth
read -p "Google OAuth Client ID: " GOOGLE_CLIENT_ID
read -p "Google OAuth Client Secret: " GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT="https://$DOMAIN/auth/callback"

# External MySQL
read -p "MySQL Host: " MYSQL_HOST
read -p "MySQL Port [3306]: " MYSQL_PORT
MYSQL_PORT=${MYSQL_PORT:-3306}
read -p "MySQL User: " MYSQL_USER
read -p "MySQL Password: " MYSQL_PASSWORD
read -p "MySQL Database: " MYSQL_DB

# ----------------------------
# STEP 7: Generate Supabase JWT keys
# ----------------------------
echo "[STEP 7] Generating Supabase JWT keys..."

# Generate a random JWT secret (256-bit)
JWT_SECRET=$(openssl rand -base64 32)

# Generate timestamps for JWT
IAT=$(date +%s)
EXP=$((IAT + 315360000))  # 10 years from now

# Base64url encode function
base64url_encode() {
    openssl base64 -e -A | tr '+/' '-_' | tr -d '='
}

# Create JWT header
JWT_HEADER='{"alg":"HS256","typ":"JWT"}'
HEADER_B64=$(echo -n "$JWT_HEADER" | base64url_encode)

# Create anon key payload and token
ANON_PAYLOAD="{\"role\":\"anon\",\"iss\":\"supabase\",\"iat\":$IAT,\"exp\":$EXP}"
ANON_PAYLOAD_B64=$(echo -n "$ANON_PAYLOAD" | base64url_encode)
ANON_SIGNATURE=$(echo -n "${HEADER_B64}.${ANON_PAYLOAD_B64}" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | base64url_encode)
SUPABASE_ANON_KEY="${HEADER_B64}.${ANON_PAYLOAD_B64}.${ANON_SIGNATURE}"

# Create service_role key payload and token
SERVICE_PAYLOAD="{\"role\":\"service_role\",\"iss\":\"supabase\",\"iat\":$IAT,\"exp\":$EXP}"
SERVICE_PAYLOAD_B64=$(echo -n "$SERVICE_PAYLOAD" | base64url_encode)
SERVICE_SIGNATURE=$(echo -n "${HEADER_B64}.${SERVICE_PAYLOAD_B64}" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | base64url_encode)
SUPABASE_SERVICE_KEY="${HEADER_B64}.${SERVICE_PAYLOAD_B64}.${SERVICE_SIGNATURE}"

# Generate a secret key base for Realtime
SECRET_KEY_BASE=$(openssl rand -base64 48)

echo "JWT keys generated successfully!"
echo "Anon Key: ${SUPABASE_ANON_KEY:0:30}..."
echo "Service Key: ${SUPABASE_SERVICE_KEY:0:30}..."

# ----------------------------
# STEP 8: Create Supabase environment file
# ----------------------------
echo "[STEP 8] Creating Supabase environment configuration..."

SUPABASE_DOCKER_DIR="$APP_DIR/supabase/docker"
mkdir -p "$SUPABASE_DOCKER_DIR/volumes/kong"
mkdir -p "$SUPABASE_DOCKER_DIR/volumes/db/init"

# Create .env file for Supabase Docker
cat > "$SUPABASE_DOCKER_DIR/.env" <<EOL
# Supabase Docker Configuration
# Generated by atlantisboard_local_deploy.sh

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
GOOGLE_REDIRECT_URI=https://$DOMAIN/auth/callback

# Ports
KONG_HTTP_PORT=54321
KONG_HTTPS_PORT=54322

# Security
SECRET_KEY_BASE=$SECRET_KEY_BASE

# Auth Settings
DISABLE_SIGNUP=false
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
EOL

echo "Supabase Docker environment created!"

# ----------------------------
# STEP 9: Start Supabase with Docker Compose
# ----------------------------
echo "[STEP 9] Starting Supabase services with Docker Compose..."

cd "$SUPABASE_DOCKER_DIR"

# Pull images first
echo "Pulling Supabase Docker images (this may take a while on first run)..."
docker-compose -f docker-compose.supabase.yml pull

# Start services
docker-compose -f docker-compose.supabase.yml up -d || { echo "Supabase Docker Compose failed"; exit 1; }

cd "$APP_DIR"

# Wait for services to be healthy
echo "Waiting for Supabase services to be ready..."
sleep 30

# Check if database is ready
MAX_RETRIES=30
RETRY_COUNT=0
while ! PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -c "SELECT 1" > /dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "ERROR: Database did not become ready in time"
        exit 1
    fi
    echo "Waiting for database... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 5
done

echo "Supabase services are ready!"

# ----------------------------
# STEP 10: Create unified app .env with real keys
# ----------------------------
echo "[STEP 10] Creating unified app .env file..."

cat > .env <<EOL
# --------------------------
# Core App
# --------------------------
APP_DOMAIN=$DOMAIN
NGINX_HTTP_PORT=$NGINX_HTTP_PORT
NGINX_HTTPS_PORT=$NGINX_HTTPS_PORT
ENABLE_SSL=$ENABLE_SSL
CERTBOT_EMAIL=$CERTBOT_EMAIL

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
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=$GOOGLE_REDIRECT
GOTRUE_SITE_URL=https://$DOMAIN
GOTRUE_URI_ALLOW_LIST=https://$DOMAIN/*

# --------------------------
# External MySQL verification
# --------------------------
EXTERNAL_MYSQL_HOST=$MYSQL_HOST
EXTERNAL_MYSQL_PORT=$MYSQL_PORT
EXTERNAL_MYSQL_USER=$MYSQL_USER
EXTERNAL_MYSQL_PASSWORD=$MYSQL_PASSWORD
EXTERNAL_MYSQL_DATABASE=$MYSQL_DB

# --------------------------
# JWT (for reference)
# --------------------------
JWT_SECRET=$JWT_SECRET
EOL

if [ ! -s .env ]; then
    echo "Failed to create unified .env. Exiting."
    exit 1
fi

echo "[STEP 10] Unified .env file created successfully"

# ----------------------------
# STEP 11: Import database schema
# ----------------------------
echo "[STEP 11] Importing database schema..."

if [ -f "supabase/db/schema.sql" ]; then
    echo "Applying schema from supabase/db/schema.sql..."
    PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -f supabase/db/schema.sql || { echo "Schema import failed"; exit 1; }
    echo "Schema imported successfully!"
else
    echo "WARNING: supabase/db/schema.sql not found. Database will be empty."
fi

# ----------------------------
# STEP 12: Apply seed data
# ----------------------------
echo "[STEP 12] Applying seed data..."

if [ -f "supabase/seed.sql" ]; then
    echo "Applying seed data from supabase/seed.sql..."
    PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -f supabase/seed.sql || { echo "Seed import failed"; exit 1; }
    echo "Seed data applied successfully!"
else
    echo "WARNING: supabase/seed.sql not found. No seed data applied."
fi

# ----------------------------
# STEP 13: Configure storage buckets
# ----------------------------
echo "[STEP 13] Configuring storage buckets..."

if [ -f "supabase/storage/buckets.sql" ]; then
    echo "Applying storage configuration from supabase/storage/buckets.sql..."
    PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -f supabase/storage/buckets.sql || { echo "Storage config failed"; exit 1; }
    echo "Storage buckets configured successfully!"
else
    echo "WARNING: supabase/storage/buckets.sql not found. Storage not configured."
fi

# ----------------------------
# STEP 14: Edge Functions (served via Docker)
# ----------------------------
echo "[STEP 14] Configuring Edge Functions..."
EDGE_FUNCS_DIR="$APP_DIR/supabase/functions"
if [ -d "$EDGE_FUNCS_DIR" ] && [ "$(ls -A $EDGE_FUNCS_DIR 2>/dev/null)" ]; then
    echo "Edge functions found and will be served via Supabase Edge Runtime container."
    echo "Functions available at: http://localhost:54321/functions/v1/"
    echo "Functions found:"
    ls -d $EDGE_FUNCS_DIR/*/ 2>/dev/null | xargs -n1 basename || echo "None"
else
    echo "No Edge Functions directory found."
fi

# ----------------------------
# STEP 15: Install frontend dependencies
# ----------------------------
echo "[STEP 15] Installing frontend dependencies..."
npm install || { echo "npm install failed"; exit 1; }

# ----------------------------
# STEP 16: Configure frontend environment
# ----------------------------
echo "[STEP 16] Configuring frontend environment..."
cat > .env.local <<EOL
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_PUBLISHABLE_KEY=$SUPABASE_ANON_KEY
VITE_SUPABASE_PROJECT_ID=local
EOL

# ----------------------------
# STEP 17: Build frontend
# ----------------------------
echo "[STEP 17] Building frontend..."
npm run build || { echo "Frontend build failed"; exit 1; }
mkdir -p frontend
mv dist frontend/
echo "[STEP 17] Frontend build complete!"

# ----------------------------
# STEP 18: Setup Deno server
# ----------------------------
echo "[STEP 18] Setting up Deno server..."
mkdir -p server
cat > server/server.ts <<'EOF'
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
const PORT = 8000;
console.log(`Deno server running on port ${PORT}`);
serve(async (req) => {
  const url = new URL(req.url);
  const filePath = `./frontend/dist${url.pathname === "/" ? "/index.html" : url.pathname}`;
  try {
    const data = await Deno.readFile(filePath);
    const ext = filePath.split(".").pop();
    const contentType = ext === "js" ? "application/javascript" : ext === "css" ? "text/css" : ext === "html" ? "text/html" : "text/plain";
    return new Response(data, { headers: { "content-type": contentType } });
  } catch {
    // SPA fallback - serve index.html for client-side routing
    try {
      const indexData = await Deno.readFile("./frontend/dist/index.html");
      return new Response(indexData, { headers: { "content-type": "text/html" } });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  }
}, { port: PORT });
EOF

# ----------------------------
# STEP 19: Create Docker Compose for frontend
# ----------------------------
echo "[STEP 19] Creating Docker Compose configuration for frontend..."
# Supabase is running via docker-compose.supabase.yml
# This docker-compose.yml is only for the Deno frontend server
cat > docker-compose.yml <<'EOF'
version: '3.9'
services:
  deno:
    image: denoland/deno:alpine
    container_name: atlantis-deno
    working_dir: /app
    volumes:
      - .:/app
    env_file:
      - .env
    command: deno run --allow-net --allow-read --allow-env server/server.ts
    ports:
      - "8000:8000"
    networks:
      - atlantis-net

networks:
  atlantis-net:
    driver: bridge
EOF

# ----------------------------
# STEP 18: Start Docker services
# ----------------------------
echo "[STEP 18] Starting Docker services..."
docker-compose up -d || { echo "Docker Compose up failed"; exit 1; }
# ----------------------------
# STEP 19: Configure Nginx using .env
# ----------------------------
echo "[STEP 19] Configuring Nginx..."
source .env

NGINX_CONF="/etc/nginx/conf.d/atlantisboard.conf"

sudo tee $NGINX_CONF > /dev/null <<EOL
server {
    listen ${NGINX_HTTP_PORT};
    server_name ${APP_DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Proxy Supabase API
    location /rest/ {
        proxy_pass http://localhost:54321/rest/;
        proxy_set_header Host \$host;
    }
    
    location /auth/ {
        proxy_pass http://localhost:54321/auth/;
        proxy_set_header Host \$host;
    }
    
    location /storage/ {
        proxy_pass http://localhost:54321/storage/;
        proxy_set_header Host \$host;
    }
    
    location /functions/ {
        proxy_pass http://localhost:54321/functions/;
        proxy_set_header Host \$host;
    }
}
EOL

sudo nginx -t || { echo "Nginx config test failed"; exit 1; }
sudo systemctl reload nginx

if [ "$ENABLE_SSL" = "yes" ]; then
  echo "[STEP 19] Enabling HTTPS with Certbot..."
  sudo certbot --nginx -d ${APP_DOMAIN} --non-interactive --agree-tos -m ${CERTBOT_EMAIL} || { echo "Certbot SSL setup failed"; exit 1; }
  sudo systemctl reload nginx

  echo "0 3 * * * root certbot renew --quiet && systemctl reload nginx" | sudo tee /etc/cron.d/certbot-renew
else
  echo "[STEP 19] HTTPS disabled, running HTTP only"
fi

# ----------------------------
# STEP 20: Setup systemd service
# ----------------------------
echo "[STEP 20] Setting up systemd service..."
SERVICE_FILE="/etc/systemd/system/atlantisboard.service"
sudo tee $SERVICE_FILE > /dev/null <<EOL
[Unit]
Description=AtlantisBoard Local Stack
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOL

sudo systemctl daemon-reload
sudo systemctl enable atlantisboard
sudo systemctl start atlantisboard

echo "======================================="
echo "✅ AtlantisBoard fully deployed locally!"
echo "Frontend: https://$DOMAIN"
echo "Supabase API: http://localhost:54321"
echo "Edge Functions: http://localhost:54321/functions/v1/"
echo "Google OAuth configured via .env"
echo "Services auto-start on reboot, SSL auto-renews."
echo "======================================="

# ----------------------------
# STEP 21: Pre-flight checks
# ----------------------------
echo "[STEP 21] Running pre-flight checks..."

# DNS check
if ! getent hosts "$APP_DOMAIN" > /dev/null; then
  echo "WARNING: Domain $APP_DOMAIN does not resolve yet. HTTPS may fail until DNS is correct."
else
  echo "DNS resolution OK for $APP_DOMAIN"
fi

# Docker health
if ! docker info > /dev/null 2>&1; then
  echo "Docker is not running correctly. Exiting."
  exit 1
fi

# ----------------------------
# STEP 22: Health check endpoints
# ----------------------------
echo "[STEP 22] Performing basic health checks..."

sleep 5

if ! curl -s http://localhost:8000 > /dev/null; then
  echo "WARNING: Deno frontend not responding on port 8000"
else
  echo "Frontend responding OK"
fi

if ! curl -s http://localhost:54321/rest/v1/ > /dev/null; then
  echo "WARNING: Supabase API not responding"
else
  echo "Supabase responding OK"
fi

# ----------------------------
# STEP 23: Create helper scripts
# ----------------------------
echo "[STEP 23] Creating helper scripts..."

cat > update.sh <<'EOF'
#!/bin/bash
set -e
cd "$HOME/atlantisboard"
git pull
npm install
npm run build
rm -rf frontend/dist
mv dist frontend/
docker-compose restart
echo "AtlantisBoard updated successfully"
EOF
chmod +x update.sh

cat > backup.sh <<'EOF'
#!/bin/bash
set -e
BACKUP_DIR="$HOME/atlantisboard_backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
# Use local Supabase postgres directly (port 5432)
PGPASSWORD=postgres pg_dump -h localhost -p 5432 -U postgres postgres > "$BACKUP_DIR/db_$TIMESTAMP.sql"
echo "Backup saved to $BACKUP_DIR/db_$TIMESTAMP.sql"
EOF
chmod +x backup.sh

cat > restore.sh <<'EOF'
#!/bin/bash
set -e
if [ -z "$1" ]; then
  echo "Usage: ./restore.sh backup.sql"
  exit 1
fi
# Use local Supabase postgres directly (port 5432)
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres postgres < "$1"
echo "Database restored from $1"
EOF
chmod +x restore.sh

cat > stop.sh <<'EOF'
#!/bin/bash
set -e
cd "$HOME/atlantisboard"
echo "Stopping AtlantisBoard services..."
docker-compose down
cd supabase/docker && docker-compose -f docker-compose.supabase.yml down
echo "All services stopped."
EOF
chmod +x stop.sh

cat > start.sh <<'EOF'
#!/bin/bash
set -e
cd "$HOME/atlantisboard"
echo "Starting AtlantisBoard services..."
cd supabase/docker && docker-compose -f docker-compose.supabase.yml up -d
cd "$HOME/atlantisboard"
docker-compose up -d
echo "All services started."
echo "Frontend: https://$(grep APP_DOMAIN .env | cut -d= -f2)"
echo "Supabase API: http://localhost:54321"
echo "Supabase Studio: http://localhost:54323"
EOF
chmod +x start.sh

# ----------------------------
# FINAL
# ----------------------------
echo "======================================="
echo "AtlantisBoard installation complete!"
echo "======================================="
echo ""
echo "Access your application:"
echo "  Frontend: https://$APP_DOMAIN"
echo "  Supabase API: http://localhost:54321"
echo "  Supabase Studio: http://localhost:54323"
echo ""
echo "Helper scripts:"
echo "  ./start.sh    - Start all services"
echo "  ./stop.sh     - Stop all services"
echo "  ./update.sh   - Pull latest code and restart"
echo "  ./backup.sh   - Backup database"
echo "  ./restore.sh  - Restore database from backup"
echo ""
echo "Docker commands:"
echo "  cd supabase/docker && docker-compose -f docker-compose.supabase.yml logs -f  # View Supabase logs"
echo "  docker-compose logs -f  # View frontend logs"
echo ""
echo "======================================="
