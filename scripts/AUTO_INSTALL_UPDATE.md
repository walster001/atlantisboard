# Auto-Install Dependencies Update

## Changes Made

Updated `scripts/dev-setup-backend.sh` to automatically install missing dependencies instead of just informing the user.

## Auto-Installation Capabilities

### ✅ Automatically Installed

1. **openssl**
   - Detects missing openssl
   - Attempts installation via: `apt-get`, `yum`, or `brew`
   - Falls back to manual instructions if auto-install fails (requires sudo)

2. **curl**
   - Detects missing curl
   - Attempts installation via: `apt-get`, `yum`, or `brew`
   - Falls back to manual instructions if auto-install fails (requires sudo)

3. **Node.js (via nvm)**
   - If `.nvmrc` exists: Installs the exact version specified
   - If no `.nvmrc`: Installs latest LTS version
   - Automatically switches to installed version
   - Falls back to manual instructions if nvm not available

4. **npm**
   - Usually comes with Node.js
   - Verified after Node.js installation

### ⚠️ Cannot Auto-Install (Manual Required)

1. **Docker**
   - Requires user interaction and system-level installation
   - Script checks if Docker is installed and running
   - Provides clear installation instructions if missing

2. **Docker Compose**
   - Usually comes with Docker
   - Script verifies availability

## Behavior

- **Idempotent**: Safe to run multiple times
- **Automatic**: Installs dependencies without user prompts (where possible)
- **Clear Errors**: Provides specific instructions for dependencies that can't be auto-installed
- **Fails Fast**: Exits early if critical dependencies (Docker, Node.js) are missing and can't be installed

## Installation Methods Supported

- **apt-get** (Debian/Ubuntu)
- **yum** (RHEL/CentOS)
- **brew** (macOS)
- **nvm** (Node Version Manager)

## Example Flow

```
1. Check openssl → Missing → Auto-install via apt-get → ✅
2. Check curl → Missing → Auto-install via apt-get → ✅
3. Check Node.js → Missing → Install via nvm → ✅
4. Check Docker → Missing → Show instructions → ❌ Exit
```

## Notes

- Auto-installation may require `sudo` privileges for system packages
- Node.js installation via nvm doesn't require sudo
- Script provides fallback instructions if auto-install fails
- All installations are idempotent (safe to re-run)

