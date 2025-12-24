# AtlantisBoard Self-Hosting Guide

This guide explains how to deploy AtlantisBoard on your own server using the local Supabase CLI.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Manual Setup](#manual-setup)
4. [Google OAuth Configuration](#google-oauth-configuration)
5. [Database Setup](#database-setup)
6. [Storage Configuration](#storage-configuration)
7. [Edge Functions](#edge-functions)
8. [Production Deployment](#production-deployment)
9. [Backup & Restore](#backup--restore)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Docker** (v20.10+) and **Docker Compose** (v2.0+)
- **Node.js** (v18+) and **npm** (v9+)
- **Git**
- **Supabase CLI** (`npm install -g supabase`)
- **PostgreSQL Client** (`psql`) - for applying migrations

### System Requirements

- **OS**: Ubuntu 20.04+ / Debian 11+ / macOS 12+ / Windows with WSL2
- **RAM**: 4GB minimum, 8GB recommended
- **Disk**: 20GB minimum
- **CPU**: 2 cores minimum

### Required Accounts

- **Google Cloud Console** account (for OAuth)
- **Domain name** (recommended for production)

---

## Quick Start

For Ubuntu/Debian, use the automated script:

```bash
# Clone the repository
git clone https://github.com/your-org/atlantisboard.git
cd atlantisboard

# Run the automated deployment script
chmod +x atlantisboard_local_deploy.sh
./atlantisboard_local_deploy.sh
```

The script will:
1. Install all dependencies
2. Set up local Supabase
3. Apply database migrations
4. Configure Nginx with HTTPS
5. Start all services

---

## Manual Setup

### Step 1: Clone and Install Dependencies

```bash
git clone https://github.com/your-org/atlantisboard.git
cd atlantisboard
npm install
```

### Step 2: Initialize Supabase

```bash
# Initialize Supabase project
supabase init

# Start local Supabase (this will take a few minutes on first run)
supabase start
```

After `supabase start` completes, you'll see output like:
```
API URL: http://localhost:54321
anon key: eyJhbGciOiJIUzI1...
service_role key: eyJhbGciOiJIUzI1...
```

Save these values for your `.env` file.

### Step 3: Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit with your values
nano .env
```

Update these critical values:
- `SUPABASE_ANON_KEY`: From `supabase start` output
- `SUPABASE_SERVICE_ROLE_KEY`: From `supabase start` output
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Same as anon key
- `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID`: From Google Cloud Console
- `GOTRUE_EXTERNAL_GOOGLE_SECRET`: From Google Cloud Console

### Step 4: Apply Database Schema

```bash
# Apply the complete schema from the db folder
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -f supabase/db/schema.sql

# Apply seed data
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -f supabase/seed.sql
```

### Step 5: Configure Storage Buckets

```bash
# Connect to the local database
psql postgresql://postgres:postgres@localhost:54322/postgres

# Run the storage configuration
\i supabase/storage/buckets.sql
\q
```

### Step 6: Build and Start

```bash
# Build the frontend
npm run build

# The built files are in ./dist
# Serve with your preferred web server
```

---

## Google OAuth Configuration

### Step 1: Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Select **Web application**

### Step 2: Configure OAuth Client

**Authorized JavaScript Origins:**
```
https://your-domain.com
http://localhost:5173  (for local development)
```

**Authorized Redirect URIs:**
```
https://your-domain.com/auth/callback
http://localhost:54321/auth/v1/callback  (for local development)
```

### Step 3: Configure Supabase Auth

Edit `supabase/config.toml`:

```toml
[auth]
site_url = "https://your-domain.com"
additional_redirect_urls = ["https://your-domain.com/auth/callback"]

[auth.external.google]
enabled = true
client_id = "env(GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(GOTRUE_EXTERNAL_GOOGLE_SECRET)"
redirect_uri = "https://your-domain.com/auth/callback"
```

Then restart Supabase:
```bash
supabase stop
supabase start
```

---

## Database Setup

### Schema Overview

The database includes:

- **23 tables** for boards, cards, users, permissions, etc.
- **82 RLS policies** for security
- **30+ database functions** for business logic
- **4 triggers** for audit logging

### First User = Admin

The first user to sign up automatically becomes an administrator. This is handled by the `handle_new_user()` trigger function.

### Resetting the Database

```bash
# Full reset (drops all data)
supabase db reset

# This applies:
# 1. All migrations in supabase/migrations/
# 2. Seed data from supabase/seed.sql
```

### Running Raw SQL

```bash
# Using psql
psql postgresql://postgres:postgres@localhost:54322/postgres

# Or using Supabase CLI
supabase db query "SELECT * FROM profiles LIMIT 10"
```

---

## Storage Configuration

### Buckets

| Bucket | Public | Purpose |
|--------|--------|---------|
| `branding` | Yes | Logos, backgrounds |
| `fonts` | Yes | Custom fonts |
| `card-attachments` | No | File attachments |

### Storage Policies

- **Branding/Fonts**: Publicly readable, admin-only write
- **Card Attachments**: Board members can read, board admins can write

### File Size Limits

- Branding: 5MB
- Fonts: 10MB
- Attachments: 50MB

---

## Edge Functions

Edge functions are located in `supabase/functions/`. They handle:

- `generate-invite-token`: Creates board invite links
- `redeem-invite-token`: Processes invite redemptions
- `import-wekan-board`: Imports boards from WeKan JSON
- `verify-user-email`: Verifies emails against external MySQL
- `save-mysql-config`: Saves MySQL verification settings
- `test-mysql-connection`: Tests MySQL connectivity

### Deploying Edge Functions Locally

```bash
# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy generate-invite-token

# Serve functions locally for development
supabase functions serve
```

### Edge Function Secrets

Set secrets for edge functions:

```bash
# Set a secret
supabase secrets set MYSQL_ENCRYPTION_KEY=your-key-here

# List secrets
supabase secrets list
```

---

## Production Deployment

### Option 1: Nginx + Certbot (Recommended)

```bash
# Install Nginx and Certbot
sudo apt install nginx certbot python3-certbot-nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/atlantisboard
```

Example Nginx configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        root /var/www/atlantisboard/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # Proxy Supabase API
    location /rest/ {
        proxy_pass http://localhost:54321/rest/;
        proxy_set_header Host $host;
    }
    
    location /auth/ {
        proxy_pass http://localhost:54321/auth/;
        proxy_set_header Host $host;
    }
    
    location /storage/ {
        proxy_pass http://localhost:54321/storage/;
        proxy_set_header Host $host;
    }
}
```

Enable HTTPS:
```bash
sudo certbot --nginx -d your-domain.com
```

### Option 2: Docker Compose

Create `docker-compose.prod.yml`:

```yaml
version: '3.9'
services:
  supabase:
    image: supabase/postgres:15.1.0.117
    # ... full config in docker-compose.yml
    
  frontend:
    image: nginx:alpine
    volumes:
      - ./dist:/usr/share/nginx/html:ro
    ports:
      - "80:80"
```

### Environment Variables for Production

```bash
# Critical security settings
GOTRUE_JWT_SECRET=<generate-with-openssl-rand-base64-32>
GOTRUE_MAILER_AUTOCONFIRM=false  # Enable email confirmation
GOTRUE_SITE_URL=https://your-production-domain.com
```

---

## Backup & Restore

### Automated Backup Script

The deployment creates `backup.sh`:

```bash
./backup.sh
# Creates: ~/atlantisboard_backups/db_YYYYMMDD_HHMMSS.sql
```

### Manual Backup

```bash
# Backup database
pg_dump postgresql://postgres:postgres@localhost:54322/postgres > backup.sql

# Backup storage
cp -r supabase/.storage ./storage-backup
```

### Restore

```bash
# Restore database
./restore.sh backup.sql

# Or manually
psql postgresql://postgres:postgres@localhost:54322/postgres < backup.sql
```

---

## Troubleshooting

### Common Issues

#### "Permission denied" errors

Check RLS policies:
```sql
SELECT * FROM pg_policies WHERE tablename = 'your_table';
```

Verify the user has correct role:
```sql
SELECT * FROM board_members WHERE user_id = 'user-uuid';
```

#### Docker containers not starting

```bash
# Check logs
docker-compose logs supabase

# Restart
supabase stop
supabase start
```

#### OAuth callback errors

1. Verify redirect URIs match exactly in Google Console
2. Check `GOTRUE_SITE_URL` is correct
3. Ensure Supabase auth config matches

#### Database connection refused

```bash
# Check if Supabase is running
supabase status

# Check port availability
netstat -tlnp | grep 54321
```

### Logs

```bash
# Supabase logs
supabase logs

# Specific service
docker logs supabase-db
docker logs supabase-auth
```

### Reset Everything

```bash
# Stop and remove all containers/data
supabase stop --no-backup

# Start fresh
supabase start
supabase db reset
```

---

## Updating

```bash
# Pull latest code
git pull origin main

# Install any new dependencies
npm install

# Apply new migrations (if any)
supabase db reset

# Rebuild frontend
npm run build

# Restart services
supabase stop
supabase start
```

Or use the helper script:
```bash
./update.sh
```

---

## Security Checklist

- [ ] Change default JWT secret
- [ ] Enable HTTPS in production
- [ ] Configure proper CORS origins
- [ ] Review and test RLS policies
- [ ] Set up automated backups
- [ ] Monitor error logs
- [ ] Keep Supabase CLI updated
- [ ] Regularly update dependencies

---

## Support

- **GitHub Issues**: Report bugs and request features
- **Documentation**: Check `docs/` folder for additional guides
- **Community**: Join discussions in GitHub Discussions

---

## License

AtlantisBoard is open source software. See LICENSE file for details.
