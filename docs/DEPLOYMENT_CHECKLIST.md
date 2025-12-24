# AtlantisBoard Local Deployment Checklist

This checklist outlines the deployment process step-by-step. Use it to manually verify each stage or troubleshoot issues.

## Prerequisites

Before starting, ensure you have:

- [ ] Ubuntu 22.04 LTS (Jammy Jellyfish) or compatible
- [ ] At least 4GB RAM available
- [ ] At least 20GB free disk space
- [ ] Root or sudo access
- [ ] Domain name pointing to this server (for HTTPS)
- [ ] Google OAuth credentials (Client ID and Secret)

---

## Phase 1: System Preparation

### Step 1.1: Update System Packages

```bash
sudo apt update && sudo apt upgrade -y
```

**Verification:**
```bash
apt list --upgradable
# Expected: Empty list or only non-critical packages
```

### Step 1.2: Install Base Dependencies

```bash
sudo apt install -y curl git unzip build-essential apt-transport-https \
  ca-certificates gnupg lsb-release nginx certbot python3-certbot-nginx \
  postgresql-client jq
```

**Verification:**
```bash
# Check each critical command
which curl git nginx psql jq
# Expected: All should return paths
```

### Step 1.3: Install Docker

```bash
# If Docker not installed:
curl -fsSL https://get.docker.com | sudo sh

# Enable and start Docker
sudo systemctl enable docker
sudo systemctl start docker

# Add user to docker group
sudo usermod -aG docker $USER
```

**Verification:**
```bash
docker --version
# Expected: Docker version 20.x or higher

sudo docker info
# Expected: No errors, shows server info

docker compose version
# Expected: Docker Compose version v2.x
```

### Step 1.4: Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

**Verification:**
```bash
node --version
# Expected: v20.x.x

npm --version
# Expected: 10.x.x or higher
```

### Step 1.5: Install Deno

```bash
curl -fsSL https://deno.land/install.sh | sh

# Add to PATH
export DENO_INSTALL="$HOME/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"

# Add to bashrc for persistence
echo 'export DENO_INSTALL="$HOME/.deno"' >> ~/.bashrc
echo 'export PATH="$DENO_INSTALL/bin:$PATH"' >> ~/.bashrc
```

**Verification:**
```bash
deno --version
# Expected: deno 1.x.x or higher
```

---

## Phase 2: Repository Setup

### Step 2.1: Clone Repository

```bash
git clone https://github.com/walster001/atlantisboard.git ~/atlantisboard
cd ~/atlantisboard
```

**Verification:**
```bash
ls -la ~/atlantisboard
# Expected: See package.json, supabase/, src/, etc.

ls supabase/db/schema.sql
# Expected: File exists
```

---

## Phase 3: Supabase Docker Services

### Step 3.1: Prepare Docker Environment

```bash
cd ~/atlantisboard/supabase/docker
mkdir -p volumes/kong volumes/db/init
```

### Step 3.2: Generate JWT Keys

```bash
# Generate JWT secret
JWT_SECRET=$(openssl rand -base64 32)
echo "JWT_SECRET: $JWT_SECRET"

# Generate timestamps
IAT=$(date +%s)
EXP=$((IAT + 315360000))  # 10 years

# Base64url encode function
base64url_encode() {
    openssl base64 -e -A | tr '+/' '-_' | tr -d '='
}

# Create header
JWT_HEADER='{"alg":"HS256","typ":"JWT"}'
HEADER_B64=$(echo -n "$JWT_HEADER" | base64url_encode)

# Create anon key
ANON_PAYLOAD="{\"role\":\"anon\",\"iss\":\"supabase\",\"iat\":$IAT,\"exp\":$EXP}"
ANON_PAYLOAD_B64=$(echo -n "$ANON_PAYLOAD" | base64url_encode)
ANON_SIGNATURE=$(echo -n "${HEADER_B64}.${ANON_PAYLOAD_B64}" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | base64url_encode)
ANON_KEY="${HEADER_B64}.${ANON_PAYLOAD_B64}.${ANON_SIGNATURE}"
echo "ANON_KEY: $ANON_KEY"

# Create service_role key
SERVICE_PAYLOAD="{\"role\":\"service_role\",\"iss\":\"supabase\",\"iat\":$IAT,\"exp\":$EXP}"
SERVICE_PAYLOAD_B64=$(echo -n "$SERVICE_PAYLOAD" | base64url_encode)
SERVICE_SIGNATURE=$(echo -n "${HEADER_B64}.${SERVICE_PAYLOAD_B64}" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | base64url_encode)
SERVICE_KEY="${HEADER_B64}.${SERVICE_PAYLOAD_B64}.${SERVICE_SIGNATURE}"
echo "SERVICE_KEY: $SERVICE_KEY"
```

### Step 3.3: Create Supabase .env

Create `~/atlantisboard/supabase/docker/.env`:

```env
POSTGRES_PASSWORD=postgres
POSTGRES_DB=postgres
POSTGRES_PORT=5432
JWT_SECRET=<your-jwt-secret>
JWT_EXP=3600
ANON_KEY=<your-anon-key>
SERVICE_ROLE_KEY=<your-service-key>
API_EXTERNAL_URL=https://your-domain.com
SITE_URL=https://your-domain.com
ADDITIONAL_REDIRECT_URLS=https://your-domain.com/*
ENABLE_GOOGLE_AUTH=true
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-secret>
GOOGLE_REDIRECT_URI=https://your-domain.com/auth/callback
KONG_HTTP_PORT=54321
KONG_HTTPS_PORT=54322
SECRET_KEY_BASE=<generate-with-openssl-rand-base64-48>
DISABLE_SIGNUP=false
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
```

### Step 3.4: Start Supabase Services

```bash
cd ~/atlantisboard/supabase/docker
docker compose -f docker-compose.supabase.yml pull
docker compose -f docker-compose.supabase.yml up -d
```

**Verification:**
```bash
# Check containers are running
docker ps --format "table {{.Names}}\t{{.Status}}"
# Expected: supabase-db, supabase-auth, supabase-rest, supabase-kong, etc.

# Check PostgreSQL is ready
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -c "SELECT 1"
# Expected: Returns 1

# Check Kong is ready
curl -s http://localhost:54321/rest/v1/
# Expected: Returns empty array [] or similar
```

### Step 3.5: Verify Supabase Schemas Exist

The `supabase/postgres` Docker image automatically creates these schemas:

```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -c \
  "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('auth', 'storage', 'public')"
```

**Expected Output:**
```
 schema_name 
-------------
 public
 auth
 storage
```

⚠️ **If `auth` or `storage` schemas are missing:**
- The Supabase images may not have finished initializing
- Wait 30-60 seconds and check again
- Check logs: `docker logs supabase-auth` and `docker logs supabase-storage`

---

## Phase 4: Database Schema Import

### Step 4.1: Wait for Services

Ensure all services are healthy before importing:

```bash
# Wait for Auth service
curl -s http://localhost:54321/auth/v1/health
# Expected: {"status":"ok"} or similar

# Wait for REST API
curl -s http://localhost:54321/rest/v1/
# Expected: No error
```

### Step 4.2: Import Main Schema

```bash
cd ~/atlantisboard
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres \
  -f supabase/db/schema.sql
```

**Verification:**
```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -c \
  "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
```

**Expected:** Tables like `profiles`, `boards`, `cards`, `columns`, etc.

### Step 4.3: Apply Seed Data

```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres \
  -f supabase/seed.sql
```

**Verification:**
```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -c \
  "SELECT id FROM app_settings WHERE id = 'default'"
# Expected: Returns 'default'
```

### Step 4.4: Configure Storage Buckets

```bash
# Wait for storage service
sleep 10

# Check storage.buckets table exists
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -c \
  "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets')"
# Expected: t (true)

# Apply storage configuration
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres \
  -f supabase/storage/buckets.sql
```

**Verification:**
```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -c \
  "SELECT id, name, public FROM storage.buckets"
```

**Expected:** Rows for `branding`, `fonts`, `card-attachments`

---

## Phase 5: Frontend Build

### Step 5.1: Create App .env

Create `~/atlantisboard/.env` and `~/atlantisboard/.env.local`:

```bash
cat > ~/atlantisboard/.env.local << EOF
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>
VITE_SUPABASE_PROJECT_ID=local
EOF
```

### Step 5.2: Install Dependencies

```bash
cd ~/atlantisboard
npm install --legacy-peer-deps
```

**Note:** The `--legacy-peer-deps` flag resolves the React 18 / @toast-ui/react-editor peer dependency conflict.

**Verification:**
```bash
ls node_modules/.bin/vite
# Expected: File exists
```

### Step 5.3: Build Frontend

```bash
npm run build
```

**Verification:**
```bash
ls -la dist/
# Expected: index.html, assets/, etc.
```

### Step 5.4: Move Build to Serve Directory

```bash
mkdir -p frontend
mv dist frontend/
```

---

## Phase 6: Edge Functions

### Step 6.1: Verify Edge Functions

```bash
ls -la ~/atlantisboard/supabase/functions/
```

**Expected Functions:**
- `generate-invite-token/`
- `import-wekan-board/`
- `redeem-invite-token/`
- `save-mysql-config/`
- `test-mysql-connection/`
- `verify-user-email/`

Each should contain an `index.ts` file.

### Step 6.2: Verify Edge Runtime Container

```bash
docker logs supabase-functions
```

**Expected:** No critical errors; functions loaded

**Test an Edge Function:**
```bash
curl -s http://localhost:54321/functions/v1/
# May return 404 or function list depending on configuration
```

---

## Phase 7: Frontend Server

### Step 7.1: Create Deno Server

Create `~/atlantisboard/server/server.ts` (the deployment script does this automatically).

### Step 7.2: Create Docker Compose

Create `~/atlantisboard/docker-compose.yml` for the frontend container.

### Step 7.3: Start Frontend Container

```bash
cd ~/atlantisboard
docker compose up -d
```

**Verification:**
```bash
docker logs atlantis-deno
# Expected: "Deno server starting on port 8000..."

curl -s http://localhost:8000/
# Expected: Returns HTML
```

---

## Phase 8: Nginx Configuration

### Step 8.1: Create Nginx Config

Create `/etc/nginx/sites-available/atlantisboard` with proper proxy settings.

### Step 8.2: Enable Site

```bash
sudo ln -sf /etc/nginx/sites-available/atlantisboard /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

**Verification:**
```bash
curl -s http://localhost/
# Expected: Returns frontend HTML
```

### Step 8.3: Enable HTTPS (Optional)

```bash
sudo certbot --nginx -d your-domain.com --non-interactive --agree-tos -m your-email@example.com
```

**Verification:**
```bash
curl -s https://your-domain.com/
# Expected: Returns frontend HTML with valid SSL
```

---

## Phase 9: Systemd Services

### Step 9.1: Create Service File

Create `/etc/systemd/system/atlantisboard.service`:

```ini
[Unit]
Description=AtlantisBoard Application
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/user/atlantisboard
ExecStart=/usr/bin/docker compose -f supabase/docker/docker-compose.supabase.yml up -d
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
ExecStop=/usr/bin/docker compose -f supabase/docker/docker-compose.supabase.yml down

[Install]
WantedBy=multi-user.target
```

### Step 9.2: Enable Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable atlantisboard
```

**Verification:**
```bash
sudo systemctl status atlantisboard
# Expected: Loaded and enabled
```

---

## Final Verification Checklist

After deployment, verify each component:

| Component | Check Command | Expected Result |
|-----------|---------------|-----------------|
| PostgreSQL | `PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -c "SELECT 1"` | Returns `1` |
| Supabase REST | `curl -s http://localhost:54321/rest/v1/` | No error |
| Supabase Auth | `curl -s http://localhost:54321/auth/v1/health` | `{"status":"ok"}` |
| Frontend (local) | `curl -s http://localhost:8000/` | HTML content |
| Nginx | `curl -s http://localhost/` | HTML content |
| HTTPS (if enabled) | `curl -s https://your-domain.com/` | HTML with valid SSL |

---

## Troubleshooting

### Issue: Schema import fails with "relation does not exist"

**Cause:** `auth.users` table not ready yet.

**Solution:** Wait longer for Supabase to initialize, then retry:
```bash
sleep 60
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -f supabase/db/schema.sql
```

### Issue: Storage buckets SQL fails

**Cause:** `storage` schema not initialized.

**Solution:** Check storage container logs:
```bash
docker logs supabase-storage
```
Wait for initialization, then retry.

### Issue: npm install fails with peer dependency errors

**Cause:** React 18 incompatibility with @toast-ui/react-editor.

**Solution:** Use `--legacy-peer-deps`:
```bash
npm install --legacy-peer-deps
```

### Issue: Docker containers not starting

**Solution:** Check logs:
```bash
docker compose -f supabase/docker/docker-compose.supabase.yml logs
```

### Issue: Certbot fails

**Cause:** Domain not pointing to server.

**Solution:** Verify DNS:
```bash
dig +short your-domain.com
# Should return your server's IP
```

---

## Quick Commands Reference

```bash
# Start all services
./start.sh

# Stop all services
./stop.sh

# Check status
./status.sh

# View logs
./logs.sh all

# Backup database
./backup.sh

# Restore database
./restore.sh backup.sql

# Update application
./update.sh
```
