---
layout: wiki
title: "Manual (Non-Docker) Installation"
description: "How to install and run Atlantisboard without Docker, including systemd service configuration."
parent: "Deployment & Installation"
nav_order: 7
permalink: /wiki/manual-install/
---

# Manual (Non-Docker) Installation

This guide covers installing Atlantisboard directly on a server without Docker. Choose this path if your infrastructure restricts container usage or if you need fine-grained control over each service.

> **Recommendation:** For most users, the [Docker Compose installation](/wiki/docker-compose-install/) is simpler and faster. Use this manual path only when Docker is not an option.

---

## Prerequisites

Install and configure each of the following before proceeding:

| Software | Version | Notes |
|----------|---------|-------|
| **Bun** | >= 1.3.5 | [Install Bun](https://bun.sh/docs/installation) |
| **MongoDB** | 8.x | Must be configured as a **replica set** |
| **Redis** | 7.x | Used for session storage and rate limiting |
| **MinIO** | Latest stable | S3-compatible object storage |
| **Git** | Any recent version | To clone the repository |

---

## Step 1: Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

Verify the installation:

```bash
bun --version
```

Ensure the version is 1.3.5 or later.

---

## Step 2: Set Up MongoDB Replica Set

Atlantisboard requires MongoDB to run as a replica set for Change Streams (real-time collaboration). Even a single-node deployment needs replica set initialisation.

### Install MongoDB 8.x

Follow the [official MongoDB installation guide](https://www.mongodb.com/docs/manual/installation/) for your operating system.

### Initialise the Replica Set

1. Edit your MongoDB configuration (`/etc/mongod.conf`) to enable the replica set:

```yaml
replication:
  replSetName: "rs0"
```

2. Restart MongoDB:

```bash
sudo systemctl restart mongod
```

3. Connect to the MongoDB shell and initialise the replica set:

```bash
mongosh
```

```javascript
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "localhost:27017" }
  ]
})
```

4. Verify the replica set status:

```javascript
rs.status()
```

You should see `"stateStr": "PRIMARY"` for your node.

---

## Step 3: Install and Configure Redis

```bash
# Debian/Ubuntu
sudo apt install redis-server

# Verify
redis-cli ping
# Should return: PONG
```

For production, set a password in `/etc/redis/redis.conf`:

```
requirepass your-strong-redis-password
```

Then restart Redis:

```bash
sudo systemctl restart redis-server
```

---

## Step 4: Install and Configure MinIO

Download and install the MinIO server:

```bash
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
sudo mv minio /usr/local/bin/
```

Create a data directory and start MinIO:

```bash
sudo mkdir -p /var/lib/minio/data

MINIO_ROOT_USER=your-access-key \
MINIO_ROOT_PASSWORD=your-secret-key \
minio server /var/lib/minio/data --console-address ":9001"
```

Create the required buckets using the MinIO Client (`mc`):

```bash
# Install mc
wget https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc
sudo mv mc /usr/local/bin/

# Configure the alias
mc alias set local http://localhost:9000 your-access-key your-secret-key

# Create all 7 required buckets
mc mb local/import-inline
mc mb local/card-attachments
mc mb local/branding
mc mb local/fonts
mc mb local/user-avatars
mc mb local/backgrounds
mc mb local/backups
```

> **Tip:** For production, run MinIO as a systemd service. See the [MinIO documentation](https://min.io/docs/minio/linux/operations/install-deploy-manage/deploy-minio-single-node-single-drive.html) for service configuration examples.

---

## Step 5: Clone and Build Atlantisboard

```bash
git clone https://github.com/your-org/atlantisboard.git
cd atlantisboard
```

Install dependencies:

```bash
bun install
```

Build the production bundle:

```bash
bun run build
```

This compiles the TypeScript server and bundles the React frontend into the `dist/` directory.

---

## Step 6: Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and set all required variables. At a minimum:

```ini
NODE_ENV=production
PORT=3000

# MongoDB (use your replica set connection string)
MONGODB_URI=mongodb://localhost:27017/kanboard?replicaSet=rs0

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-strong-redis-password

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key

# Security secrets (generate each with: openssl rand -base64 48)
JWT_SECRET=<generated-secret-1>
SESSION_SECRET=<generated-secret-2>
CSRF_SECRET=<generated-secret-3>
ENCRYPTION_KEY=<generated-secret-4>

# Public URL
APP_URL=https://boards.example.com
CORS_ORIGIN=https://boards.example.com
```

See the [Environment Variables Reference](/wiki/environment-variables/) for the complete list.

---

## Step 7: Start the Application

### Main Server

```bash
bun run dist/server/index.js
```

The application will start on the configured `PORT` (default 3000).

### Background Worker (Optional but Recommended)

The background worker handles scheduled tasks such as automatic backups and cleanup jobs. You can run it as a separate process:

```bash
bun run dist/server/workers/index.js
```

Alternatively, set `ENABLE_CRON_JOBS_IN_MAIN=true` in your `.env` to run scheduled jobs within the main server process (suitable for single-process deployments).

---

## Step 8: Set Up systemd Services

For production, use systemd to manage Atlantisboard as a system service that starts automatically on boot.

### Main Application Service

Create `/etc/systemd/system/atlantisboard.service`:

```ini
[Unit]
Description=Atlantisboard Application
After=network.target mongod.service redis-server.service
Wants=mongod.service redis-server.service

[Service]
Type=simple
User=atlantisboard
Group=atlantisboard
WorkingDirectory=/opt/atlantisboard
EnvironmentFile=/opt/atlantisboard/.env
ExecStart=/usr/local/bin/bun run dist/server/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/backups/atlantisboard

[Install]
WantedBy=multi-user.target
```

### Background Worker Service (Optional)

Create `/etc/systemd/system/atlantisboard-worker.service`:

```ini
[Unit]
Description=Atlantisboard Background Worker
After=network.target mongod.service redis-server.service atlantisboard.service

[Service]
Type=simple
User=atlantisboard
Group=atlantisboard
WorkingDirectory=/opt/atlantisboard
EnvironmentFile=/opt/atlantisboard/.env
ExecStart=/usr/local/bin/bun run dist/server/workers/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

### Enable and Start the Services

```bash
# Create a dedicated system user
sudo useradd --system --create-home --shell /usr/sbin/nologin atlantisboard

# Set ownership
sudo chown -R atlantisboard:atlantisboard /opt/atlantisboard

# Reload systemd, enable, and start
sudo systemctl daemon-reload
sudo systemctl enable atlantisboard atlantisboard-worker
sudo systemctl start atlantisboard atlantisboard-worker

# Check status
sudo systemctl status atlantisboard
```

---

## Verifying the Installation

1. Check that the application is running:

```bash
curl -s http://localhost:3000/health
```

A successful response indicates the server is up and connected to MongoDB and Redis.

2. Open `http://<your-server-ip>:3000` in your browser. You should see the Atlantisboard login page.

3. Proceed to [Creating the First Admin Account](/wiki/first-admin-account/).

---

## Next Steps

- [Reverse Proxy Setup](/wiki/reverse-proxy/) — add Nginx or Caddy for TLS and domain-based access.
- [Environment Variables Reference](/wiki/environment-variables/) — fine-tune your configuration.
- [Updating & Maintenance](/wiki/updating/) — how to update a manual installation.
