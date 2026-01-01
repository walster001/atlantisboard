#!/bin/bash
# Database Migration Script for AtlantisBoard Backend
# Runs Prisma migrations to set up the database schema

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

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

echo "📦 Installing dependencies..."
npm install

echo ""
echo "🔧 Generating Prisma client..."
npm run prisma:generate

echo ""
echo "📊 Running database migrations..."
npm run prisma:migrate

echo ""
echo "✅ Database migration complete!"
echo ""
echo "Next steps:"
echo "  1. Verify database schema: npm run prisma:studio"
echo "  2. Start the backend server: npm run dev (or npm start for production)"
echo ""

