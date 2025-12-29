#!/bin/bash
# =====================================================
# Docker Setup Checker for WSL
# =====================================================

set -e

echo "🔍 Checking Docker installation..."

# Check if docker command exists
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    echo ""
    echo "📋 Setup Options:"
    echo ""
    echo "Option 1: Docker Desktop for Windows (Recommended for WSL)"
    echo "  1. Download from: https://www.docker.com/products/docker-desktop"
    echo "  2. Install Docker Desktop"
    echo "  3. Enable 'Use the WSL 2 based engine' in Settings → General"
    echo "  4. Enable integration with your WSL distro in Settings → Resources → WSL Integration"
    echo "  5. Restart WSL: wsl --shutdown (in PowerShell), then reopen terminal"
    echo ""
    echo "Option 2: Install Docker Engine in WSL"
    echo "  Run: ./scripts/install-docker-wsl.sh"
    echo ""
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "⚠️  Docker is installed but not running"
    echo ""
    
    # Check if we're in WSL
    if grep -qi microsoft /proc/version; then
        echo "You're running in WSL. Try:"
        echo "  1. Start Docker Desktop for Windows"
        echo "  2. Or start Docker service: sudo service docker start"
        echo "  3. Or install Docker Desktop if not installed"
    else
        echo "Try starting Docker:"
        echo "  sudo systemctl start docker"
        echo "  sudo systemctl enable docker"
    fi
    echo ""
    exit 1
fi

# Check Docker Compose
if ! docker compose version &> /dev/null 2>&1; then
    echo "⚠️  Docker Compose not found"
    echo "  Docker Compose v2 should be included with Docker Desktop"
    echo "  Or install: sudo apt-get install docker-compose-plugin"
    exit 1
fi

echo "✅ Docker is installed and running"
echo "   Version: $(docker --version)"
echo "   Compose: $(docker compose version 2>/dev/null | head -1 || echo 'Not found')"
echo ""

