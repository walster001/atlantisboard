#!/bin/bash
# Complete fix for users table
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$(dirname "$0")"

echo "🔧 Complete fix for users table..."
echo ""

nvm use 20 2>/dev/null || nvm use 22 2>/dev/null || true

echo "📦 Using Node.js $(node --version)"
echo ""

node fix-users-table-complete.mjs

