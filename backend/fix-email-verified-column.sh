#!/bin/bash
# Fix emailVerified column issue using Node.js/Prisma
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$(dirname "$0")"

echo "🔧 Fixing emailVerified column issue..."
echo ""

# Check Node version
nvm use 20 2>/dev/null || nvm use 22 2>/dev/null || true

echo "📊 Using Node.js $(node --version)"
echo ""

# Run the Node.js fix script
node fix-email-verified.mjs
