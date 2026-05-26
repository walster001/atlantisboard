---
layout: wiki
title: "Docker Compose Installation"
description: "Step-by-step guide for deploying Atlantisboard with Docker Compose."
parent: "Deployment & Installation"
nav_order: 4
permalink: /wiki/docker-compose-install/
---

# Docker Compose Installation (Recommended)

Docker Compose is the fastest and most reliable way to deploy Atlantisboard. It bundles the application, database, cache, and object storage into a single configuration file that you can start with one command.

![Docker Compose architecture diagram](images/docker-compose-architecture.png)

---

## Prerequisites

Before you begin, make sure you have the following installed:

- [ ] **Docker Engine** 20.10 or later
- [ ] **Docker Compose** v2+ (the `docker compose` CLI plugin)
- [ ] **Git** (to clone the repository)
- [ ] A Linux server, VM, or WSL2 environment (macOS and Windows with Docker Desktop also work for development)

Verify your installations:

```bash
docker --version
docker compose version
git --version
```

---

## Step-by-Step Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/atlantisboard.git
cd atlantisboard
```

### 2. Create Your Environment File

Copy the example environment file and open it for editing:

```bash
cp .env.example .env
```

### 3. Generate Secrets

Atlantisboard requires four cryptographic secrets. Generate each one with:

```bash
openssl rand -base64 48
```

Run this command **four times** and paste the results into your `.env` file for:

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Signs JSON Web Tokens for authentication |
| `SESSION_SECRET` | Signs Express session cookies |
| `CSRF_SECRET` | Signs CSRF protection tokens |
| `ENCRYPTION_KEY` | AES-256-GCM key for encrypting stored credentials (OAuth secrets, MySQL passwords, VAPID keys) |

> **Warning:** Never reuse the same secret for multiple variables. Each must be unique. Never commit your `.env` file to version control.

### 4. Configure Essential Environment Variables

At a minimum, review and set:

```ini
NODE_ENV=production
PORT=3000
APP_URL=https://boards.example.com
CORS_ORIGIN=https://boards.example.com

JWT_SECRET=<your-generated-secret>
SESSION_SECRET=<your-generated-secret>
CSRF_SECRET=<your-generated-secret>
ENCRYPTION_KEY=<your-generated-secret>

MINIO_ACCESS_KEY=<choose-a-strong-access-key>
MINIO_SECRET_KEY=<choose-a-strong-secret-key>
```

For a complete list of every variable, see the [Environment Variables Reference](environment-variables.md).

### 5. Start the Stack

```bash
docker compose -f docker-compose.prod.yml up -d
```

This pulls the required images, builds the application container, and starts all services in the background.

### 6. Verify the Deployment

Check that all containers are running and healthy:

```bash
docker compose -f docker-compose.prod.yml ps
```

You should see five containers (four persistent services + one init container that exits after setup):

| Container | Status |
|-----------|--------|
| `mongodb` | Running (healthy) |
| `redis` | Running (healthy) |
| `minio` | Running (healthy) |
| `minio-setup` | Exited (0) — this is expected |
| `app` | Running (healthy) |

### 7. Access Atlantisboard

Open your browser and navigate to:

```
http://<your-server-ip>:3000
```

You should see the Atlantisboard login page. Proceed to [Creating the First Admin Account](first-admin-account.md) to register your initial user.

---

## What Each Container Does

### `mongodb` — Database

MongoDB 8.0 stores all application data: users, workspaces, boards, cards, labels, comments, activities, and settings. It runs as a **replica set** (required for Change Streams, which power real-time collaboration).

### `redis` — Session Store & Rate Limiting

Redis 7 Alpine handles:
- **Session storage** — user login sessions are stored in Redis via `connect-redis`.
- **Rate-limit counters** — protects authentication endpoints and file uploads from abuse.

### `minio` — Object Storage

MinIO provides S3-compatible object storage for all file assets:
- Card attachments
- User avatars
- Branding assets (logos, favicons, background images)
- Custom fonts
- Board background images
- Database backups

### `minio-setup` — Bucket Initialisation

A one-shot init container that runs on first startup to create the 7 required MinIO buckets:

| Bucket | Purpose |
|--------|---------|
| `import-inline` | Temporary storage for board import files |
| `card-attachments` | Card file attachments |
| `branding` | Login and app branding assets |
| `fonts` | Uploaded custom font files |
| `user-avatars` | User profile pictures |
| `backgrounds` | Board and homepage background images |
| `backups` | Database and storage backup archives |

This container exits with code 0 after creating the buckets. It is safe to ignore its "Exited" status.

### `app` — Atlantisboard Application

The main application container:
- Built with a multi-stage Dockerfile for a minimal production image.
- Runs as a non-root user for security.
- Serves both the React frontend and the Express API on port 3000.
- Connects to MongoDB, Redis, and MinIO using the environment variables in your `.env` file.

---

## Data Persistence

All data is stored in named Docker volumes, which persist across container restarts and rebuilds:

| Volume | Mounted By | Contains |
|--------|-----------|----------|
| `mongodb_data` | `mongodb` | Database files |
| `redis_data` | `redis` | Redis persistence (RDB/AOF) |
| `minio_data` | `minio` | All object storage buckets and their contents |

> **Warning:** Removing Docker volumes (`docker compose down -v`) permanently deletes all data. Always create a backup before performing destructive operations.

---

## Managing the Stack

### Stop All Containers

```bash
docker compose -f docker-compose.prod.yml stop
```

### Restart All Containers

```bash
docker compose -f docker-compose.prod.yml restart
```

### View Logs

```bash
# All containers
docker compose -f docker-compose.prod.yml logs -f

# Specific container
docker compose -f docker-compose.prod.yml logs -f app
```

### Remove Containers (Keep Data)

```bash
docker compose -f docker-compose.prod.yml down
```

### Remove Containers and Volumes (Destroys All Data)

```bash
docker compose -f docker-compose.prod.yml down -v
```

> **Warning:** The `-v` flag deletes all named volumes. This is irreversible. Only use this if you want a completely fresh start.

---

## Next Steps

- [Environment Variables Reference](environment-variables.md) — fine-tune every configuration option.
- [Reverse Proxy Setup](reverse-proxy.md) — put Nginx or Caddy in front of Atlantisboard for TLS and domain-based access.
- [Creating the First Admin Account](first-admin-account.md) — register your first user and gain admin access.
