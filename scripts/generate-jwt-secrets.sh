#!/bin/bash
# =====================================================
# JWT Secret Generator for AtlantisBoard Backend
# =====================================================
# Generates secure JWT secrets using openssl
# =====================================================

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔐 Generating JWT secrets...${NC}"

# Check if openssl is available
if ! command -v openssl &> /dev/null; then
    echo "❌ openssl not found. Please install openssl or generate secrets manually."
    echo ""
    echo "To generate manually, run:"
    echo "  openssl rand -hex 32"
    exit 1
fi

# Generate JWT_SECRET (minimum 32 characters)
JWT_SECRET=$(openssl rand -hex 32)

# Generate JWT_REFRESH_SECRET (minimum 32 characters)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)

echo -e "${GREEN}✅ Secrets generated${NC}"
echo ""
echo "JWT_SECRET=$JWT_SECRET"
echo "JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET"

