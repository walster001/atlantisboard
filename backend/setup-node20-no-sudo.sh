#!/bin/bash
# Setup Node.js 20 via nvm (no sudo required)
set -e

echo "🔧 Setting up Node.js 20 via nvm..."
echo ""

# Step 1: Setup nvm
export NVM_DIR="$HOME/.nvm"

# Install nvm if not present
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo "📦 Installing nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    
    # Source nvm
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    
    echo "✅ nvm installed"
else
    echo "✅ nvm already installed"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
fi

echo ""

# Step 2: Install Node.js 20
echo "📦 Installing Node.js 20..."
nvm install 20
nvm use 20
nvm alias default 20

echo ""
echo "✅ Node.js 20 installed and set as default"
echo ""

# Step 3: Verify
echo "🔍 Verifying installation..."
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo "Node.js path: $(which node)"
echo ""

# Step 4: Add nvm to shell profile
SHELL_PROFILE="$HOME/.bashrc"
if ! grep -q "NVM_DIR" "$SHELL_PROFILE" 2>/dev/null; then
    echo "📝 Adding nvm to $SHELL_PROFILE..."
    cat >> "$SHELL_PROFILE" << 'EOF'

# NVM Configuration
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
EOF
    echo "✅ nvm added to $SHELL_PROFILE"
else
    echo "✅ nvm already in $SHELL_PROFILE"
fi

echo ""
echo "════════════════════════════════════════"
echo "✅ Setup complete!"
echo "════════════════════════════════════════"
echo ""
echo "Node.js $(node --version) is now active"
echo ""
echo "⚠️  IMPORTANT: If system Node.js 14 is still in PATH, run:"
echo "   sudo rm -f /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx"
echo "   sudo rm -f /usr/bin/node /usr/bin/npm /usr/bin/npx"
echo ""
echo "Then reload your shell:"
echo "   source ~/.bashrc"
echo ""

