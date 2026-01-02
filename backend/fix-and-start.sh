#!/bin/bash
# Fix backend dependencies and start server
set -e

# Load nvm - try multiple methods
export NVM_DIR="$HOME/.nvm"

# Method 1: Direct source
if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
fi

# Method 2: Try from .bashrc
if ! command -v nvm &> /dev/null && [ -s "$HOME/.bashrc" ]; then
    source "$HOME/.bashrc"
fi

# Method 3: Try common nvm installation paths
if ! command -v nvm &> /dev/null; then
    if [ -s "/usr/share/nvm/nvm.sh" ]; then
        export NVM_DIR="/usr/share/nvm"
        . "$NVM_DIR/nvm.sh"
    elif [ -s "/opt/nvm/nvm.sh" ]; then
        export NVM_DIR="/opt/nvm"
        . "$NVM_DIR/nvm.sh"
    fi
fi

cd "$(dirname "$0")"

echo "🔧 Checking for Node.js 20 or 22..."

# Check if nvm is available
if command -v nvm &> /dev/null || type nvm &> /dev/null; then
    if ! nvm use 22 2>/dev/null && ! nvm use 20 2>/dev/null; then
        echo "❌ Node.js 20+ not found. Installing Node.js 20..."
        nvm install 20
        nvm use 20
    fi
elif [ -s "$NVM_DIR/nvm.sh" ]; then
    # Try sourcing again
    . "$NVM_DIR/nvm.sh"
    if ! nvm use 22 2>/dev/null && ! nvm use 20 2>/dev/null; then
        echo "❌ Node.js 20+ not found. Installing Node.js 20..."
        nvm install 20
        nvm use 20
    fi
else
    echo "⚠️  nvm not found. Checking system Node.js..."
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js not found. Please install Node.js 20+ manually"
        echo "   Or install nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
        exit 1
    fi
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        echo "❌ Node.js version is too old. Found $(node --version), need 20+"
        exit 1
    fi
    echo "✅ Using system Node.js $(node --version)"
fi

echo "✅ Using Node.js $(node --version)"

echo ""
echo "🔧 Fixing .env file line endings..."
sed -i 's/\r$//' .env
sed -i 's/\r//g' .env

echo "✅ .env file fixed"

echo ""
echo "🔧 Rebuilding native dependencies (bcrypt)..."
npm rebuild bcrypt 2>&1 | grep -E '(bcrypt|built|error)' || true

echo ""
echo "🚀 Starting backend server..."
echo "   Backend will be available at: http://127.0.0.1:3000"
echo "   OAuth endpoint: http://127.0.0.1:3000/api/auth/google"
echo ""
echo "Press Ctrl+C to stop"
echo ""

npm run dev
