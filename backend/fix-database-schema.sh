#!/bin/bash
# Fix database schema - add missing emailVerified column
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$(dirname "$0")"

echo "🔧 Checking database schema..."

# Load environment
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if emailVerified column exists
echo "   Checking if emailVerified column exists..."
COLUMN_EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='email_verified');" 2>/dev/null | tr -d ' ' || echo "false")

if [ "$COLUMN_EXISTS" = "t" ]; then
    echo "✅ emailVerified column already exists"
else
    echo "❌ emailVerified column missing. Adding it..."
    
    # Add the column
    psql "$DATABASE_URL" << 'EOF'
ALTER TABLE users ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN DEFAULT false;
EOF
    
    if [ $? -eq 0 ]; then
        echo "✅ emailVerified column added successfully"
    else
        echo "❌ Failed to add column. Trying with different syntax..."
        psql "$DATABASE_URL" << 'EOF'
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
EOF
    fi
fi

echo ""
echo "🔧 Regenerating Prisma client..."
nvm use 20 2>/dev/null || nvm use 22 2>/dev/null || true
npx prisma generate

echo ""
echo "✅ Database schema fixed!"
echo ""

