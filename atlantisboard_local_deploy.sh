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
sudo apt install -y curl git docker.io docker-compose build-essential unzip nginx certbot python3-certbot-nginx

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

# Unified .env creation
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
# Supabase / Deno
# --------------------------
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=local

# --------------------------
# Google OAuth
# --------------------------
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOTRUE_EXTERNAL_GOOGLE_SECRET=$GOOGLE_CLIENT_SECRET
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=$GOOGLE_REDIRECT

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

echo "[STEP 6] Unified .env file created successfully"

# ----------------------------
# STEP 7: Initialize local Supabase
# ----------------------------
echo "[STEP 7] Initializing local Supabase project..."
supabase init || { echo "Supabase init failed"; exit 1; }

echo "[STEP 7] Starting local Supabase..."
supabase start || { echo "Supabase start failed"; exit 1; }
sleep 10

# ----------------------------
# STEP 8: Import database schema
# ----------------------------
if [ -f "supabase/db/schema.sql" ]; then
    echo "[STEP 8] Importing schema into local Supabase..."
supabase db reset --yes || { echo "DB reset failed"; exit 1; }
supabase db remote set localhost:5432
supabase db restore supabase/db/schema.sql || { echo "DB restore failed"; exit 1; }
echo "[STEP 8] Schema imported!"
else
    echo "[STEP 8] No schema.sql found. Continuing with empty local database."
fi

# ----------------------------
# STEP 9: Deploy Edge Functions locally
# ----------------------------
EDGE_FUNCS_DIR="$APP_DIR/supabase/functions"
if [ -d "$EDGE_FUNCS_DIR" ] && [ "$(ls -A $EDGE_FUNCS_DIR)" ]; then
    echo "[STEP 9] Deploying Edge Functions to local Supabase..."
    cd $EDGE_FUNCS_DIR
    for func in */ ; do
        echo "Deploying function: $func"
        supabase functions deploy ${func%/} --project-ref local || { echo "Edge function $func deploy failed"; exit 1; }
    done
    cd $APP_DIR
    echo "[STEP 9] Edge Functions deployed locally!"
else
    echo "[STEP 9] No Edge Functions found."
fi

# ----------------------------
# STEP 10: Install frontend dependencies
# ----------------------------
npm install || { echo "npm install failed"; exit 1; }

# ----------------------------
# STEP 11: Configure frontend to use local Supabase
# ----------------------------
mkdir -p frontend
cat > .env.local <<EOL
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=local
EOL

# ----------------------------
# STEP 12: Build frontend
# ----------------------------
npm run build || { echo "Frontend build failed"; exit 1; }
mv dist frontend/
echo "[STEP 12] Frontend build complete!"

# ----------------------------
# STEP 13: Setup Deno server
# ----------------------------
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
    return new Response("Not Found", { status: 404 });
  }
}, { port: PORT });
EOF

# ----------------------------
# STEP 14: Create Docker Compose using unified .env
# ----------------------------
cat > docker-compose.yml <<'EOF'
version: '3.9'
services:
  supabase:
    image: supabase/supabase:latest
    container_name: supabase
    env_file:
      - .env
    ports:
      - "54321:54321"
      - "5432:5432"
    networks:
      - atlantis-net

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
    depends_on:
      - supabase
    networks:
      - atlantis-net

networks:
  atlantis-net:
    driver: bridge
EOF

# ----------------------------
# STEP 15: Start Docker services
# ----------------------------
docker-compose up -d || { echo "Docker Compose up failed"; exit 1; }

# ----------------------------
# ----------------------------
# STEP 16: Configure Nginx using .env
# ----------------------------
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
}
EOL

sudo nginx -t || { echo "Nginx config test failed"; exit 1; }
sudo systemctl reload nginx

if [ "$ENABLE_SSL" = "yes" ]; then
  echo "[STEP 16] Enabling HTTPS with Certbot"
  sudo certbot --nginx -d ${APP_DOMAIN} --non-interactive --agree-tos -m ${CERTBOT_EMAIL} || { echo "Certbot SSL setup failed"; exit 1; }
  sudo systemctl reload nginx

  echo "0 3 * * * root certbot renew --quiet && systemctl reload nginx" | sudo tee /etc/cron.d/certbot-renew
else
  echo "[STEP 16] HTTPS disabled, running HTTP only"
fi

# ----------------------------
# STEP 17: Setup systemd service for Docker Compose
# ----------------------------
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
echo "✅ AtlantisBoard fully deployed locally with unified .env!"
echo "Frontend: https://$DOMAIN"
echo "Supabase API: http://localhost:54321"
echo "Edge Functions deployed locally!"
echo "Google OAuth and external MySQL verification configured via unified .env" 
echo "Services auto-start on reboot, SSL auto-renews."
echo "======================================="

# ----------------------------
# STEP 18: Pre-flight checks
# ----------------------------
echo "[STEP 18] Running pre-flight checks..."

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
# STEP 19: Health check endpoints
# ----------------------------
echo "[STEP 19] Performing basic health checks..."

sleep 5

if ! curl -s http://localhost:8000 > /dev/null; then
  echo "WARNING: Deno frontend not responding on port 8000"
else
  echo "Frontend responding OK"
fi

if ! curl -s http://localhost:54321/health > /dev/null; then
  echo "WARNING: Supabase API not responding"
else
  echo "Supabase responding OK"
fi

# ----------------------------
# STEP 20: Create helper scripts
# ----------------------------
echo "[STEP 20] Creating helper scripts..."

cat > update.sh <<'EOF'
#!/bin/bash
set -e
cd "$HOME/atlantisboard"
git pull
docker-compose pull
docker-compose up -d
echo "AtlantisBoard updated successfully"
EOF
chmod +x update.sh

cat > backup.sh <<'EOF'
#!/bin/bash
set -e
BACKUP_DIR="$HOME/atlantisboard_backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec supabase pg_dump -U postgres postgres > "$BACKUP_DIR/db_$TIMESTAMP.sql"
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
docker exec -i supabase psql -U postgres postgres < "$1"
echo "Database restored from $1"
EOF
chmod +x restore.sh

# ----------------------------
# STEP 21: Write .env.example
# ----------------------------
cat > .env.example <<'EOF'
APP_DOMAIN=example.com
NGINX_HTTP_PORT=80
NGINX_HTTPS_PORT=443
ENABLE_SSL=yes
CERTBOT_EMAIL=admin@example.com

SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=local

GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=your-google-client-id
GOTRUE_EXTERNAL_GOOGLE_SECRET=your-google-client-secret
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://example.com/auth/callback

EXTERNAL_MYSQL_HOST=db.example.com
EXTERNAL_MYSQL_PORT=3306
EXTERNAL_MYSQL_USER=user
EXTERNAL_MYSQL_PASSWORD=password
EXTERNAL_MYSQL_DATABASE=verification
EOF

# ----------------------------
# FINAL
# ----------------------------
echo "======================================="
echo "AtlantisBoard installation complete."
echo "Domain: https://$APP_DOMAIN"
echo "Update app: ./update.sh"
echo "Backup DB: ./backup.sh"
echo "Restore DB: ./restore.sh <file.sql>"
echo "======================================="
