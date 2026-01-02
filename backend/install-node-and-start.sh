#!/bin/bash
# Install Node.js 20 and start backend
set -e

# Load nvm - try multiple locations
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
elif [ -s "/usr/share/nvm/nvm.sh" ]; then
    export NVM_DIR="/usr/share/nvm"
    . "$NVM_DIR/nvm.sh"
elif [ -s "$HOME/.bashrc" ]; then
    # Try loading from .bashrc
    source "$HOME/.bashrc"
fi

# If still not loaded, try to source it explicitly
if ! command -v nvm &> /dev/null && [ -s "$HOME/.nvm/nvm.sh" ]; then
    . "$HOME/.nvm/nvm.sh"
fi

cd "$(dirname "$0")"

echo "🔧 Checking Node.js versions..."
nvm list

echo ""
echo "🔧 Installing Node.js 20..."
nvm install 20

echo ""
echo "🔧 Switching to Node.js 20..."
nvm use 20

echo "✅ Using Node.js $(node --version)"
echo "✅ Using npm $(npm --version)"

echo ""
echo "🔧 Fixing .env file line endings..."
sed -i 's/\r$//' .env
sed -i 's/\r//g' .env

echo "✅ .env file fixed"

echo ""
echo "🔧 Rebuilding native dependencies (bcrypt)..."
npm rebuild bcrypt 2>&1 | grep -E '(bcrypt|built|error|Error)' || echo "✅ bcrypt rebuilt"

echo ""
echo "🚀 Starting backend server..."
echo "   Backend will be available at: http://127.0.0.1:3000"
echo "   OAuth endpoint: http://127.0.0.1:3000/api/auth/google"
echo ""
echo "Press Ctrl+C to stop"
echo ""

npm run dev

