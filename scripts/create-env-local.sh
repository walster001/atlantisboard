#!/bin/bash
# =====================================================
# Interactive .env.local Creation Script
# =====================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

if [ -f .env.local ]; then
    echo "⚠️  .env.local already exists!"
    read -p "Overwrite? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
fi

echo "🔧 Generating JWT keys..."
KEYS_OUTPUT=$(python3 scripts/generate-keys.py)

# Extract keys
JWT_SECRET=$(echo "$KEYS_OUTPUT" | grep "JWT_SECRET=" | cut -d'=' -f2)
ANON_KEY=$(echo "$KEYS_OUTPUT" | grep "ANON_KEY=" | cut -d'=' -f2)
SERVICE_ROLE_KEY=$(echo "$KEYS_OUTPUT" | grep "SERVICE_ROLE_KEY=" | cut -d'=' -f2)
SECRET_KEY_BASE=$(echo "$KEYS_OUTPUT" | grep "SECRET_KEY_BASE=" | cut -d'=' -f2)

echo "✅ Keys generated"
echo ""

# Ask for Google OAuth credentials
echo "📝 Google OAuth Configuration"
echo "   Get these from: https://console.cloud.google.com"
echo ""
read -p "Google Client ID (leave empty to skip): " GOOGLE_CLIENT_ID
read -p "Google Client Secret (leave empty to skip): " GOOGLE_CLIENT_SECRET

# Create .env.local
cat > .env.local <<EOF
# =====================================================
# AtlantisBoard Local Development Environment
# =====================================================
# Generated: $(date)
# =====================================================

# Supabase Local Configuration
SUPABASE_URL=http://localhost:8000
VITE_SUPABASE_URL=http://localhost:8000
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}
VITE_SUPABASE_PROJECT_ID=local

# Database Configuration
POSTGRES_PASSWORD=postgres
POSTGRES_DB=postgres
POSTGRES_PORT=5432

# JWT Configuration
JWT_SECRET=${JWT_SECRET}
JWT_EXP=3600

# API Keys
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}

# GoTrue Auth Configuration
SITE_URL=http://localhost:8080
API_EXTERNAL_URL=http://localhost:8000
ADDITIONAL_REDIRECT_URLS=http://localhost:8080/*,http://localhost:8080/

# Google OAuth Configuration
ENABLE_GOOGLE_AUTH=${GOOGLE_CLIENT_ID:+true}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/v1/callback

# Email Configuration
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
DISABLE_SIGNUP=false

# Realtime Configuration
SECRET_KEY_BASE=${SECRET_KEY_BASE}

# Kong API Gateway
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443
EOF

echo ""
echo "✅ Created .env.local"
if [ -z "$GOOGLE_CLIENT_ID" ] || [ -z "$GOOGLE_CLIENT_SECRET" ]; then
    echo ""
    echo "⚠️  Google OAuth not configured. Add credentials to .env.local later."
    echo "   See docs/LOCAL_DEVELOPMENT.md for setup instructions."
fi

