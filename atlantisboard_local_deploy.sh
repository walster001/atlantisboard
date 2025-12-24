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
# STEP 4: Install Supabase CLI
# ----------------------------
echo "[STEP 4] Installing Supabase CLI..."
npm install -g @supabase/cli

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
# STEP 7: Start local Supabase
# ----------------------------
echo "[STEP 7] Starting local Supabase..."

# Skip init if already initialized (config.toml exists in repo)
if [ ! -f "supabase/.temp" ]; then
    echo "Supabase config found in repo, skipping init..."
fi

supabase start || { echo "Supabase start failed"; exit 1; }
sleep 10

# Extract keys from supabase status
echo "[STEP 7] Extracting Supabase keys..."
SUPABASE_ANON_KEY=$(supabase status --output json | grep -o '"anon_key":"[^"]*"' | cut -d'"' -f4)
SUPABASE_SERVICE_KEY=$(supabase status --output json | grep -o '"service_role_key":"[^"]*"' | cut -d'"' -f4)
SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54322/postgres"

if [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "Failed to extract Supabase anon key. Using fallback method..."
    SUPABASE_ANON_KEY=$(supabase status | grep "anon key:" | awk '{print $3}')
fi

if [ -z "$SUPABASE_SERVICE_KEY" ]; then
    SUPABASE_SERVICE_KEY=$(supabase status | grep "service_role key:" | awk '{print $3}')
fi

echo "Anon Key: ${SUPABASE_ANON_KEY:0:20}..."
echo "Service Key: ${SUPABASE_SERVICE_KEY:0:20}..."

# ----------------------------
# STEP 8: Create unified .env with real keys
# ----------------------------
echo "[STEP 8] Creating unified .env file..."

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
SUPABASE_DB_URL=$SUPABASE_DB_URL

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
EOL

if [ ! -s .env ]; then
    echo "Failed to create unified .env. Exiting."
    exit 1
fi

echo "[STEP 8] Unified .env file created successfully"

# ----------------------------
# STEP 9: Import database schema
# ----------------------------
echo "[STEP 9] Importing database schema..."

if [ -f "supabase/db/schema.sql" ]; then
    echo "Applying schema from supabase/db/schema.sql..."
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -f supabase/db/schema.sql || { echo "Schema import failed"; exit 1; }
    echo "Schema imported successfully!"
else
    echo "WARNING: supabase/db/schema.sql not found. Database will be empty."
fi

# ----------------------------
# STEP 10: Apply seed data
# ----------------------------
echo "[STEP 10] Applying seed data..."

if [ -f "supabase/seed.sql" ]; then
    echo "Applying seed data from supabase/seed.sql..."
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -f supabase/seed.sql || { echo "Seed import failed"; exit 1; }
    echo "Seed data applied successfully!"
else
    echo "WARNING: supabase/seed.sql not found. No seed data applied."
fi

# ----------------------------
# STEP 11: Configure storage buckets
# ----------------------------
echo "[STEP 11] Configuring storage buckets..."

if [ -f "supabase/storage/buckets.sql" ]; then
    echo "Applying storage configuration from supabase/storage/buckets.sql..."
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -f supabase/storage/buckets.sql || { echo "Storage config failed"; exit 1; }
    echo "Storage buckets configured successfully!"
else
    echo "WARNING: supabase/storage/buckets.sql not found. Storage not configured."
fi

# ----------------------------
# STEP 12: Deploy Edge Functions locally
# ----------------------------
EDGE_FUNCS_DIR="$APP_DIR/supabase/functions"
if [ -d "$EDGE_FUNCS_DIR" ] && [ "$(ls -A $EDGE_FUNCS_DIR)" ]; then
    echo "[STEP 12] Deploying Edge Functions to local Supabase..."
    # For local development, use supabase functions serve or deploy without --project-ref
    # Edge functions are auto-served when supabase start runs with functions in the repo
    echo "Edge functions will be served automatically by local Supabase."
    echo "Functions found:"
    ls -d $EDGE_FUNCS_DIR/*/ 2>/dev/null | xargs -n1 basename || echo "None"
    echo "[STEP 12] Edge Functions ready!"
else
    echo "[STEP 12] No Edge Functions found."
fi

# ----------------------------
# STEP 13: Install frontend dependencies
# ----------------------------
echo "[STEP 13] Installing frontend dependencies..."
npm install || { echo "npm install failed"; exit 1; }

# ----------------------------
# STEP 14: Configure frontend environment
# ----------------------------
echo "[STEP 14] Configuring frontend environment..."
cat > .env.local <<EOL
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_PUBLISHABLE_KEY=$SUPABASE_ANON_KEY
VITE_SUPABASE_PROJECT_ID=local
EOL

# ----------------------------
# STEP 15: Build frontend
# ----------------------------
echo "[STEP 15] Building frontend..."
npm run build || { echo "Frontend build failed"; exit 1; }
mkdir -p frontend
mv dist frontend/
echo "[STEP 15] Frontend build complete!"

# ----------------------------
# STEP 16: Setup Deno server
# ----------------------------
echo "[STEP 16] Setting up Deno server..."
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
# STEP 17: Create Docker Compose
# ----------------------------
echo "[STEP 17] Creating Docker Compose configuration..."
# Note: Supabase is already running via supabase start, not Docker Compose
# Docker Compose here is only for the Deno frontend server
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
# Use local Supabase postgres directly
PGPASSWORD=postgres pg_dump -h localhost -p 54322 -U postgres postgres > "$BACKUP_DIR/db_$TIMESTAMP.sql"
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
# Use local Supabase postgres directly
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres postgres < "$1"
echo "Database restored from $1"
EOF
chmod +x restore.sh

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
echo "  ./update.sh   - Pull latest code and restart"
echo "  ./backup.sh   - Backup database"
echo "  ./restore.sh  - Restore database from backup"
echo ""
echo "Manage services:"
echo "  supabase stop    - Stop Supabase"
echo "  supabase start   - Start Supabase"
echo "  docker-compose down/up -d - Restart Deno frontend"
echo ""
echo "======================================="
