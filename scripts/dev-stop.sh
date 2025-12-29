#!/bin/bash
# =====================================================
# Stop Local Development Services
# =====================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT/supabase/docker"

# Check for Docker Compose (v2 preferred, fallback to v1)
if docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    echo "❌ Docker Compose not found"
    exit 1
fi

echo "🛑 Stopping Supabase services..."
$DOCKER_COMPOSE_CMD -f docker-compose.supabase.yml down

echo "✅ Services stopped"

