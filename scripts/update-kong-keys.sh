#!/bin/bash
cd /mnt/e/atlantisboard

# Get keys from .env.local
ANON_KEY=$(grep '^ANON_KEY=' .env.local | cut -d'=' -f2)
SERVICE_KEY=$(grep '^SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2)

if [ -z "$ANON_KEY" ] || [ -z "$SERVICE_KEY" ]; then
    echo "ERROR: Could not find ANON_KEY or SERVICE_ROLE_KEY in .env.local"
    exit 1
fi

# Update kong.yml with actual key values
KONG_YML="supabase/docker/volumes/kong/kong.yml"
sed -i "s|\${SUPABASE_ANON_KEY}|$ANON_KEY|g" "$KONG_YML"
sed -i "s|\${SUPABASE_SERVICE_KEY}|$SERVICE_KEY|g" "$KONG_YML"

echo "✅ Updated kong.yml with actual key values"
echo "   Anon key (first 30 chars): ${ANON_KEY:0:30}..."
echo "   Service key (first 30 chars): ${SERVICE_KEY:0:30}..."

