# Local Development Guide

This guide will help you set up a complete local development environment for AtlantisBoard with Supabase, including Google OAuth authentication.

## Prerequisites

- **Docker** and **Docker Compose** installed and running
- **Node.js 20+** (use nvm: `nvm use 20`)
- **Python 3** (for key generation)
- **PostgreSQL client** (psql) - optional, for direct database access
- **Google Cloud Console** account (for OAuth setup)

## Quick Start

### 1. Initial Setup

Run the automated setup script:

```bash
./scripts/dev-setup.sh
```

This script will:
- Generate JWT keys automatically
- Create `.env.local` with all configuration
- Start Supabase Docker services
- Apply database schema and migrations
- Set up storage buckets
- Seed initial data

### 2. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Select **Web application**

**Authorized JavaScript Origins:**
```
http://localhost:8080
http://localhost:8000
```

**Authorized Redirect URIs:**
```
http://localhost:8000/auth/v1/callback
http://localhost:8080/
http://localhost:8080/auth/callback
```

6. Copy the **Client ID** and **Client Secret**
7. Add them to `.env.local`:
   ```bash
   GOOGLE_CLIENT_ID=your-client-id-here
   GOOGLE_CLIENT_SECRET=your-client-secret-here
   ```

### 3. Start Development

```bash
./scripts/dev-start.sh
```

Or manually:
```bash
# Start Supabase services
cd supabase/docker
docker-compose -f docker-compose.supabase.yml --env-file ../../.env.local up -d

# Start frontend (in project root)
npm run dev
```

## Manual Setup (Alternative)

If you prefer to set up manually:

### 1. Generate Keys

```bash
python3 scripts/generate-keys.py
```

Copy the output values to `.env.local` (see `.env.local.example` for template).

### 2. Create `.env.local`

Copy `.env.local.example` to `.env.local` and fill in:
- Generated JWT keys
- Google OAuth credentials
- Any custom configuration

### 3. Start Supabase Services

```bash
cd supabase/docker
docker-compose -f docker-compose.supabase.yml --env-file ../../.env.local up -d
```

### 4. Apply Database Schema

```bash
# Apply main schema
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -f ../db/schema.sql

# Apply migrations
for file in ../migrations/*.sql; do
  PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -f "$file"
done

# Apply seed data
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -f ../seed.sql

# Setup storage buckets
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -f ../storage/buckets.sql
```

### 5. Start Frontend

```bash
# Ensure Node 20 is active
source setup-nvm.sh
nvm use 20

# Start dev server
npm run dev
```

## Services & URLs

Once running, you'll have access to:

- **Frontend**: http://localhost:8080
- **Supabase API**: http://localhost:8000
- **PostgreSQL**: localhost:5432
- **GoTrue Auth**: http://localhost:8000/auth/v1/
- **PostgREST**: http://localhost:8000/rest/v1/
- **Storage**: http://localhost:8000/storage/v1/
- **Edge Functions**: http://localhost:8000/functions/v1/

## Stopping Services

```bash
./scripts/dev-stop.sh
```

Or manually:
```bash
cd supabase/docker
docker-compose -f docker-compose.supabase.yml down
```

## Troubleshooting

### Services Won't Start

1. Check Docker is running: `docker info`
2. Check ports aren't in use: `netstat -tuln | grep -E '8000|5432|8080'`
3. Check logs: `docker-compose -f supabase/docker/docker-compose.supabase.yml logs`

### Database Connection Issues

1. Verify PostgreSQL is running: `docker ps | grep supabase-db`
2. Check connection: `PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -c "SELECT 1"`

### OAuth Redirect Issues

1. Verify Google OAuth credentials in `.env.local`
2. Check redirect URIs match exactly in Google Cloud Console
3. Ensure `supabase/config.toml` has correct `site_url` and `additional_redirect_urls`
4. Check browser console for OAuth errors

### Frontend Can't Connect to Supabase

1. Verify `VITE_SUPABASE_URL` in `.env.local` is `http://localhost:8000`
2. Check Supabase API is running: `curl http://localhost:8000/rest/v1/`
3. Restart frontend dev server after changing `.env.local`

### Reset Everything

```bash
# Stop services
./scripts/dev-stop.sh

# Remove volumes (WARNING: deletes all data)
cd supabase/docker
docker-compose -f docker-compose.supabase.yml down -v

# Restart setup
cd ../..
./scripts/dev-setup.sh
```

## Development Workflow

1. **Make code changes** in `src/`
2. **Hot reload** will automatically update the frontend
3. **Database changes** should be added as migrations in `supabase/migrations/`
4. **Edge functions** auto-reload when changed in `supabase/functions/`
5. **Storage files** persist in Docker volumes

## Production Build

To build for production:

```bash
# Build frontend
npm run build

# The dist/ folder contains production-ready files
# These can be served with nginx or any static file server
```

## Environment Variables

Key environment variables in `.env.local`:

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Supabase API URL | `http://localhost:8000` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon key for client | Generated JWT |
| `JWT_SECRET` | Secret for signing JWTs | Generated |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | From Google Console |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Secret | From Google Console |
| `POSTGRES_PASSWORD` | Database password | `postgres` (dev only) |

## Additional Resources

- [Supabase Local Development](https://supabase.com/docs/guides/cli/local-development)
- [Google OAuth Setup](https://developers.google.com/identity/protocols/oauth2)
- [Docker Compose Documentation](https://docs.docker.com/compose/)

