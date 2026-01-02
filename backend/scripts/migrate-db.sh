#!/bin/bash
# Database Migration Script for AtlantisBoard Backend
# Runs Prisma migrations to set up the database schema
# Idempotent: safe to run multiple times

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCK_FILE="$BACKEND_DIR/.prisma-generate.lock"

cd "$BACKEND_DIR"

echo "=========================================="
echo "AtlantisBoard Database Migration"
echo "=========================================="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found in $BACKEND_DIR"
    echo "   Please copy .env.example to .env and configure it"
    exit 1
fi

# Load environment variables
export $(grep -v '^#' .env | xargs)

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL not set in .env file"
    exit 1
fi

# Check if Prisma CLI is available
if [ ! -f "node_modules/.bin/prisma" ]; then
    echo "❌ Error: Prisma CLI not found"
    echo "   Please run: npm install"
    exit 1
fi

# Function to acquire lock
acquire_lock() {
    local timeout=30
    local count=0
    while [ -f "$LOCK_FILE" ] && [ $count -lt $timeout ]; do
        local lock_pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
        if [ -n "$lock_pid" ] && ps -p "$lock_pid" > /dev/null 2>&1; then
            echo "⏳ Waiting for Prisma generation to complete (PID: $lock_pid)..."
            sleep 1
            count=$((count + 1))
        else
            # Lock file exists but process is dead, remove stale lock
            rm -f "$LOCK_FILE"
            break
        fi
    done
    
    if [ -f "$LOCK_FILE" ]; then
        echo "❌ Error: Timeout waiting for Prisma generation lock"
        exit 1
    fi
    
    # Create lock file
    echo $$ > "$LOCK_FILE"
}

# Function to release lock
release_lock() {
    rm -f "$LOCK_FILE"
}

# Trap to ensure lock is released on exit
trap release_lock EXIT INT TERM

# Generate Prisma client (idempotent with lock)
echo "🔧 Generating Prisma client..."
acquire_lock

# Check if Prisma client is already generated and up-to-date
PRISMA_CLIENT_DIR="node_modules/.prisma/client"
SCHEMA_FILE="prisma/schema.prisma"
NEEDS_GENERATE=false

if [ ! -d "$PRISMA_CLIENT_DIR" ]; then
    echo "   Prisma client not found, generating..."
    NEEDS_GENERATE=true
elif [ -f "$SCHEMA_FILE" ] && [ "$SCHEMA_FILE" -nt "$PRISMA_CLIENT_DIR" ]; then
    echo "   Schema file is newer than Prisma client, regenerating..."
    NEEDS_GENERATE=true
else
    echo "   Prisma client is up-to-date, skipping generation"
fi

if [ "$NEEDS_GENERATE" = true ]; then
    npm run prisma:generate
    if [ $? -ne 0 ]; then
        release_lock
        echo "❌ Error: Failed to generate Prisma client"
        exit 1
    fi
    echo "✅ Prisma client generated"
else
    echo "✅ Prisma client already generated"
fi

release_lock

# Run database migrations
echo ""
echo "📊 Running database migrations..."
npx prisma migrate deploy
if [ $? -ne 0 ]; then
    echo "❌ Error: Database migrations failed"
    exit 1
fi

echo ""
echo "✅ Database migration complete!"
echo ""
echo "Next steps:"
echo "  1. Verify database schema: npm run prisma:studio"
echo "  2. Start the backend server: npm run dev (or npm start for production)"
echo ""

