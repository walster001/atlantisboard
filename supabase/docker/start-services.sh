#!/bin/bash
# =====================================================
# Start Supabase Services with Environment Variables
# =====================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load environment variables from .env.local
if [ -f "$PROJECT_ROOT/.env.local" ]; then
    echo "📝 Loading environment variables from .env.local..."
    set -a  # automatically export all variables
    source "$PROJECT_ROOT/.env.local"
    set +a  # stop automatically exporting
else
    echo "❌ .env.local not found at $PROJECT_ROOT/.env.local"
    exit 1
fi

# Verify critical variables are set
if [ -z "$JWT_SECRET" ]; then
    echo "❌ JWT_SECRET is not set in .env.local"
    exit 1
fi

if [ -z "$ANON_KEY" ]; then
    echo "❌ ANON_KEY is not set in .env.local"
    exit 1
fi

if [ -z "$SERVICE_ROLE_KEY" ]; then
    echo "❌ SERVICE_ROLE_KEY is not set in .env.local"
    exit 1
fi

echo "✅ Environment variables loaded"
echo "   JWT_SECRET: ${JWT_SECRET:0:20}..."
echo "   ANON_KEY: ${ANON_KEY:0:30}..."

# Create .env file in docker directory for docker-compose to read automatically
cd "$SCRIPT_DIR"
echo "📝 Creating .env file for docker-compose..."
cat > .env <<EOF
# Auto-generated from .env.local - do not edit manually
JWT_SECRET=${JWT_SECRET}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}
POSTGRES_DB=${POSTGRES_DB:-postgres}
POSTGRES_PORT=${POSTGRES_PORT:-5432}
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
SECRET_KEY_BASE=${SECRET_KEY_BASE}
SITE_URL=${SITE_URL:-http://localhost:8080}
API_EXTERNAL_URL=${API_EXTERNAL_URL:-http://localhost:8000}
ADDITIONAL_REDIRECT_URLS=${ADDITIONAL_REDIRECT_URLS}
ENABLE_GOOGLE_AUTH=${ENABLE_GOOGLE_AUTH:-false}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}
GOOGLE_REDIRECT_URI=${GOOGLE_REDIRECT_URI:-}
ENABLE_EMAIL_SIGNUP=${ENABLE_EMAIL_SIGNUP:-true}
ENABLE_EMAIL_AUTOCONFIRM=${ENABLE_EMAIL_AUTOCONFIRM:-true}
DISABLE_SIGNUP=${DISABLE_SIGNUP:-false}
JWT_EXP=${JWT_EXP:-3600}
KONG_HTTP_PORT=${KONG_HTTP_PORT:-8000}
KONG_HTTPS_PORT=${KONG_HTTPS_PORT:-8443}
EOF

# Check for Docker Compose (v2 preferred, fallback to v1)
if docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    echo "❌ Docker Compose not found"
    exit 1
fi

# Start services
echo "🚀 Starting Supabase services..."
$DOCKER_COMPOSE_CMD -f docker-compose.supabase.yml up -d

echo "⏳ Waiting for database to be ready..."
sleep 10

# Create auth schema if it doesn't exist (required for GoTrue)
echo "📝 Ensuring auth schema exists..."
$DOCKER_COMPOSE_CMD -f docker-compose.supabase.yml exec -T db psql -U postgres -d postgres <<EOF 2>/dev/null || true
CREATE SCHEMA IF NOT EXISTS auth;
EOF

echo "✅ Services started. Waiting for health checks..."
sleep 10

# Check status
$DOCKER_COMPOSE_CMD -f docker-compose.supabase.yml ps

