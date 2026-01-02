#!/bin/bash
# Reinstall dependencies to fix missing modules
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$(dirname "$0")"

echo "🔧 Reinstalling dependencies..."
echo ""

# Use Node.js 20
nvm use 20 2>/dev/null || nvm use 22 2>/dev/null || true

echo "📦 Using Node.js $(node --version)"
echo "📦 Using npm $(npm --version)"
echo ""

# Remove node_modules and package-lock.json for clean install
echo "🗑️  Cleaning old dependencies..."
rm -rf node_modules
rm -f package-lock.json

echo ""
echo "📥 Installing dependencies (this may take a few minutes)..."
npm install

echo ""
echo "🔧 Installing Prisma engines..."
npx prisma generate

echo ""
echo "✅ Dependencies reinstalled!"
echo ""

