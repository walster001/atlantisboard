#!/bin/bash
# Create auth schema in database
docker compose -f docker-compose.supabase.yml exec -T db psql -U postgres -d postgres <<EOF
CREATE SCHEMA IF NOT EXISTS auth;
EOF

