#!/bin/bash
# Safely create essential database tables
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$(dirname "$0")"

echo "🔧 Creating essential database tables..."
echo ""

nvm use 20 2>/dev/null || nvm use 22 2>/dev/null || true

echo "📦 Using Node.js $(node --version)"
echo ""

# Run the safe creation script
node create-tables-safely.mjs

