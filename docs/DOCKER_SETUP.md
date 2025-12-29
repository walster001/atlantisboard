# Docker Setup Guide for WSL

This guide will help you set up Docker for local development in WSL (Windows Subsystem for Linux).

## Quick Check

Run this to check your Docker status:

```bash
./scripts/check-docker.sh
```

## Option 1: Docker Desktop for Windows (Recommended)

This is the easiest option for WSL users.

### Step 1: Download and Install

1. Download Docker Desktop from: https://www.docker.com/products/docker-desktop
2. Run the installer
3. Follow the installation wizard

### Step 2: Configure WSL Integration

1. Open Docker Desktop
2. Go to **Settings** → **General**
   - ✅ Enable "Use the WSL 2 based engine"
3. Go to **Settings** → **Resources** → **WSL Integration**
   - ✅ Enable your WSL distribution (e.g., Ubuntu)
4. Click **Apply & Restart**

### Step 3: Restart WSL

In PowerShell (as Administrator):
```powershell
wsl --shutdown
```

Then reopen your WSL terminal.

### Step 4: Verify

```bash
docker --version
docker info
```

## Option 2: Docker Engine in WSL

If you prefer not to use Docker Desktop, you can install Docker Engine directly in WSL.

### Installation

```bash
./scripts/install-docker-wsl.sh
```

Or manually:

```bash
# Update packages
sudo apt-get update

# Install prerequisites
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start Docker
sudo service docker start

# Add user to docker group (to run without sudo)
sudo usermod -aG docker $USER

# Logout and login again, or run:
newgrp docker
```

### Verify Installation

```bash
sudo docker run hello-world
```

## Troubleshooting

### "Cannot connect to the Docker daemon"

**If using Docker Desktop:**
1. Make sure Docker Desktop is running
2. Check WSL integration is enabled in Docker Desktop settings
3. Restart WSL: `wsl --shutdown` (in PowerShell), then reopen terminal

**If using Docker Engine:**
```bash
# Start Docker service
sudo service docker start

# Check status
sudo service docker status

# Enable auto-start
sudo systemctl enable docker
```

### "Permission denied" errors

Add your user to the docker group:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

Or logout and login again.

### Docker Desktop not showing in WSL

1. Open Docker Desktop
2. Go to Settings → Resources → WSL Integration
3. Enable your WSL distribution
4. Click Apply & Restart
5. Restart WSL: `wsl --shutdown` (in PowerShell)

### Check Docker Status

```bash
# Check if Docker is running
docker info

# Check Docker version
docker --version

# Check Docker Compose
docker compose version

# List running containers
docker ps
```

## After Docker is Running

Once Docker is set up, continue with local development:

```bash
./scripts/dev-setup.sh
```

## Additional Resources

- [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)
- [Docker Engine Installation](https://docs.docker.com/engine/install/ubuntu/)
- [WSL Integration](https://docs.docker.com/desktop/wsl/)

