#!/bin/bash
# Setup complete database schema
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$(dirname "$0")"

echo "🔧 Setting up database schema..."
echo ""

nvm use 20 2>/dev/null || nvm use 22 2>/dev/null || true

echo "📦 Using Node.js $(node --version)"
echo ""

# Run the Node.js setup script
node setup-database-schema.mjs

