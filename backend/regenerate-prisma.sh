#!/bin/bash
# Regenerate Prisma client after schema changes
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$(dirname "$0")"

echo "🔧 Regenerating Prisma client..."

nvm use 20 2>/dev/null || nvm use 22 2>/dev/null || true

npx prisma generate

echo ""
echo "✅ Prisma client regenerated!"
echo ""

