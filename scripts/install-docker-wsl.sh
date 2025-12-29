#!/bin/bash
# =====================================================
# Install Docker Engine in WSL
# =====================================================
# Alternative to Docker Desktop
# =====================================================

set -e

echo "🐳 Installing Docker Engine in WSL..."
echo ""

# Check if already installed
if command -v docker &> /dev/null; then
    echo "✅ Docker is already installed"
    docker --version
    exit 0
fi

# Update package index
echo "📦 Updating package index..."
sudo apt-get update

# Install prerequisites
echo "📦 Installing prerequisites..."
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
echo "🔑 Adding Docker GPG key..."
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up repository
echo "📝 Setting up Docker repository..."
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
echo "📦 Installing Docker Engine..."
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start Docker service
echo "🚀 Starting Docker service..."
sudo service docker start

# Add user to docker group (to run without sudo)
if [ "$EUID" -ne 0 ]; then
    echo "👤 Adding user to docker group..."
    sudo usermod -aG docker $USER
    echo "⚠️  You may need to logout and login again for group changes to take effect"
    echo "   Or run: newgrp docker"
fi

# Verify installation
echo ""
echo "✅ Docker installation complete!"
echo ""
echo "Verifying installation..."
if sudo docker run hello-world &> /dev/null; then
    echo "✅ Docker is working correctly"
else
    echo "⚠️  Docker installed but verification failed"
    echo "   Try: sudo docker run hello-world"
fi

echo ""
echo "📋 Next steps:"
echo "  1. If you added yourself to docker group, logout/login or run: newgrp docker"
echo "  2. Run: ./scripts/dev-setup.sh"

