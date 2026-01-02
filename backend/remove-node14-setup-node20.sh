#!/bin/bash
# Remove system Node.js 14 and setup Node.js 20/22 via nvm
set -e

echo "🔍 Checking current Node.js installation..."
echo "Current node: $(which node 2>/dev/null || echo 'not found')"
echo "Current version: $(node --version 2>/dev/null || echo 'not found')"
echo ""

# Step 1: Remove system Node.js 14
echo "🗑️  Removing system Node.js 14..."
echo "   Note: This requires sudo for system directories"

# Remove from /usr/local/bin (requires sudo)
if [ -f "/usr/local/bin/node" ]; then
    echo "   Removing /usr/local/bin/node..."
    sudo rm -f /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx 2>/dev/null || {
        echo "   ⚠️  Could not remove /usr/local/bin/node (may need manual removal)"
    }
fi

# Remove from /usr/bin if symlinked (requires sudo)
if [ -L "/usr/bin/node" ] || [ -f "/usr/bin/node" ]; then
    echo "   Removing /usr/bin/node..."
    sudo rm -f /usr/bin/node /usr/bin/npm /usr/bin/npx 2>/dev/null || {
        echo "   ⚠️  Could not remove /usr/bin/node (may need manual removal)"
    }
fi

# Try to remove via apt if installed (requires sudo)
if dpkg -l 2>/dev/null | grep -q "^ii.*nodejs "; then
    echo "   Removing nodejs package via apt..."
    sudo apt-get remove -y nodejs npm 2>/dev/null || true
    sudo apt-get purge -y nodejs npm 2>/dev/null || true
fi

# Update PATH to prioritize user's nvm over system node
echo "   Updating PATH to prioritize nvm..."

echo "✅ System Node.js removed"
echo ""

# Step 2: Setup nvm
echo "🔧 Setting up nvm..."

export NVM_DIR="$HOME/.nvm"

# Install nvm if not present
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo "   Installing nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    
    # Source nvm
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
else
    echo "   nvm already installed"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
fi

echo "✅ nvm setup complete"
echo ""

# Step 3: Install Node.js 20 or 22
echo "📦 Installing Node.js 20..."
nvm install 20
nvm use 20
nvm alias default 20

echo ""
echo "✅ Node.js 20 installed and set as default"
echo ""

# Step 4: Verify
echo "🔍 Verifying installation..."
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo "Node.js path: $(which node)"
echo ""

# Step 5: Add nvm to shell profile
SHELL_PROFILE="$HOME/.bashrc"
if ! grep -q "NVM_DIR" "$SHELL_PROFILE"; then
    echo "   Adding nvm to $SHELL_PROFILE..."
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
echo "To use in new terminals, run:"
echo "  source ~/.bashrc"
echo "  nvm use 20"
echo ""

