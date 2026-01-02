#!/bin/bash
# Create Prisma migration for full schema
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$(dirname "$0")"

echo "🔧 Creating full database schema migration..."
echo ""

nvm use 20 2>/dev/null || nvm use 22 2>/dev/null || true

# First, ensure Prisma client is generated
echo "📦 Generating Prisma client..."
npx prisma generate

# Create migration from schema
echo ""
echo "📝 Creating migration from Prisma schema..."
npx prisma migrate dev --name init_full_schema --create-only

echo ""
echo "📦 Applying migration..."
npx prisma migrate deploy

echo ""
echo "✅ Full schema migration complete!"
echo ""

