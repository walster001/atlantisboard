#!/bin/bash
# Quick fix for missing @prisma/engines
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$(dirname "$0")"

echo "🔧 Fixing Prisma engines..."
echo ""

nvm use 20 2>/dev/null || nvm use 22 2>/dev/null || true

echo "📦 Reinstalling Prisma..."
npm install prisma @prisma/client --save

echo ""
echo "🔧 Generating Prisma client..."
npx prisma generate

echo ""
echo "✅ Prisma engines fixed!"
echo ""

