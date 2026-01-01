#!/bin/bash
# =====================================================
# Generate JWT keys for Supabase self-hosted deployment
# =====================================================

set -e

# Generate a random JWT secret (256-bit)
JWT_SECRET=$(openssl rand -base64 32)

# JWT payload for anon key
ANON_PAYLOAD=$(cat <<EOF
{
  "role": "anon",
  "iss": "supabase",
  "iat": $(date +%s),
  "exp": $(($(date +%s) + 315360000))
}
EOF
)

# JWT payload for service_role key
SERVICE_PAYLOAD=$(cat <<EOF
{
  "role": "service_role",
  "iss": "supabase",
  "iat": $(date +%s),
  "exp": $(($(date +%s) + 315360000))
}
EOF
)

# Base64url encode function
base64url_encode() {
    openssl base64 -e -A | tr '+/' '-_' | tr -d '='
}

# Create JWT header
JWT_HEADER='{"alg":"HS256","typ":"JWT"}'
HEADER_B64=$(echo -n "$JWT_HEADER" | base64url_encode)

# Create anon key
ANON_PAYLOAD_B64=$(echo -n "$ANON_PAYLOAD" | base64url_encode)
ANON_SIGNATURE=$(echo -n "${HEADER_B64}.${ANON_PAYLOAD_B64}" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | base64url_encode)
ANON_KEY="${HEADER_B64}.${ANON_PAYLOAD_B64}.${ANON_SIGNATURE}"

# Create service_role key
SERVICE_PAYLOAD_B64=$(echo -n "$SERVICE_PAYLOAD" | base64url_encode)
SERVICE_SIGNATURE=$(echo -n "${HEADER_B64}.${SERVICE_PAYLOAD_B64}" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | base64url_encode)
SERVICE_ROLE_KEY="${HEADER_B64}.${SERVICE_PAYLOAD_B64}.${SERVICE_SIGNATURE}"

# Output the keys
echo "JWT_SECRET=$JWT_SECRET"
echo "ANON_KEY=$ANON_KEY"
echo "SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
