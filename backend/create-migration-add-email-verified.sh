#!/bin/bash
# Create and apply Prisma migration for email_verified column
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$(dirname "$0")"

echo "🔧 Creating Prisma migration for email_verified column..."
echo ""

nvm use 20 2>/dev/null || nvm use 22 2>/dev/null || true

# Create migration
echo "📝 Creating migration..."
npx prisma migrate dev --name add_email_verified_column --create-only 2>&1 | grep -v "warn" || true

# Apply migration
echo ""
echo "📦 Applying migration..."
npx prisma migrate deploy

echo ""
echo "🔧 Regenerating Prisma client..."
npx prisma generate

echo ""
echo "✅ Migration complete!"
echo ""

