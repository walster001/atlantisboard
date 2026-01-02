#!/bin/bash
# Verify database and fix missing tables
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$(dirname "$0")"

echo "🔍 Verifying database setup..."
echo ""

nvm use 20 2>/dev/null || nvm use 22 2>/dev/null || true

echo "📦 Using Node.js $(node --version)"
echo ""

# Run the verification script
node verify-and-fix-database.mjs

