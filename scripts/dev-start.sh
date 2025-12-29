#!/bin/bash
# =====================================================
# Quick Start Script for Local Development
# =====================================================
# Starts Supabase services and frontend dev server
# =====================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ .env.local not found. Run scripts/dev-setup.sh first."
    exit 1
fi

# Start Supabase services using wrapper script
if [ -f supabase/docker/start-services.sh ]; then
    bash supabase/docker/start-services.sh
else
    # Fallback
    set -a
    source .env.local
    set +a
    cd supabase/docker
    if docker compose version &> /dev/null 2>&1; then
        docker compose -f docker-compose.supabase.yml up -d
    elif command -v docker-compose &> /dev/null; then
        docker-compose -f docker-compose.supabase.yml up -d
    else
        echo "❌ Docker Compose not found"
        exit 1
    fi
fi

cd "$PROJECT_ROOT"

# Wait a moment for services
sleep 5

# Start frontend dev server
echo "🚀 Starting frontend development server..."
echo ""

# Use nvm if available
if [ -f setup-nvm.sh ]; then
    source setup-nvm.sh
    nvm use 20
fi

npm run dev

