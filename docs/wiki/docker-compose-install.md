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

> **Production VM (Debian/Ubuntu):** You can skip manual compose steps by using the release zip and **`sudo ./atlantisboard-setup`** (choose **Docker full stack**). See [Debian installation (auto setup)](debian-install.md) or [npm install](npm-install.md).

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

Atlantisboard requires five cryptographic secrets. Generate each one with:

```bash
openssl rand -base64 48
```

Run this command **five times** and paste the results into your `.env` file for:

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Signs JSON Web Tokens for authentication |
| `SESSION_SECRET` | Signs Express session cookies |
| `CSRF_SECRET` | Signs CSRF protection tokens |
| `ENCRYPTION_KEY` | AES-256-GCM key for encrypting stored credentials (OAuth secrets, MySQL passwords, VAPID keys) |
| `MEDIA_SIGN_SECRET` | HMAC signing for time-limited branding and asset URLs (must differ from `JWT_SECRET`) |

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
MEDIA_SIGN_SECRET=<your-generated-secret>

REDIS_PASSWORD=<your-generated-secret>

MONGODB_ROOT_USER=kanboard_root
MONGODB_ROOT_PASSWORD=<your-generated-secret>
MONGODB_APP_USER=kanboard_app
MONGODB_APP_PASSWORD=<your-generated-secret>
MONGODB_URI=mongodb://kanboard_app:<MONGODB_APP_PASSWORD>@mongodb:27017/kanboard?authSource=kanboard&replicaSet=rs0

MINIO_ROOT_ACCESS_KEY=<minio-root-access-key>
MINIO_ROOT_SECRET_KEY=<minio-root-secret-key>
MINIO_ACCESS_KEY=<scoped-app-access-key>
MINIO_SECRET_KEY=<scoped-app-secret-key>
```

For a single credential set (simpler, less isolated), you may omit `MINIO_ROOT_*` and use the same values for both MinIO root and the app. For least privilege, use distinct root and application keys as shown above.

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

You should see seven services (four persistent + three one-shot init jobs that exit 0):

| Container | Status |
|-----------|--------|
| `mongodb` | Running (healthy) |
| `mongodb-init` | Exited (0) — replica set initiation |
| `redis` | Running (healthy) |
| `minio` | Running (healthy) |
| `minio-setup` | Exited (0) — bucket and optional scoped user |
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

MongoDB 8.0 stores all application data: users, workspaces, boards, cards, labels, comments, activities, and settings. It runs as a **replica set** with **SCRAM authentication** in production (required for Change Streams, which power real-time collaboration). The `mongodb-init` job configures `rs0` on first deploy.

**Oplog sizing:** change streams read the oplog. For production, configure enough oplog retention (typically **24–48 hours** of writes at peak load) so a deploy or outage does not roll the oplog before the app resumes from its stored tokens. On self-hosted MongoDB, adjust `replication.oplogSizeMB`; on Atlas, use the cluster’s oplog window settings. Check headroom with `db.getReplicationInfo()` in `mongosh`.

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
- **Malware scanning:** includes ClamAV. On start, if **`MemAvailable` ≥ 2 GB** (default), the entrypoint starts **`clamd`** inside this container (~200–400 MB extra RAM for signatures). With less available memory it uses on-demand **`clamscan`** instead. Signatures persist in the `clamav-sigs-prod` volume. See [Malware scanning](environment-variables.md#malware-scanning-clamav--pompelmi).
- **Video streaming:** serves attachment video with HTTP range requests. **ABR packaging** (ffmpeg, optional quality selector) runs only when the container sees **≥ 4 vCPUs** unless `VIDEO_ABR_ENABLED` overrides. Smaller VMs still play videos progressively. See [Video streaming](environment-variables.md#video-streaming) and [System Requirements — Video attachments](system-requirements.md#video-attachments-card-uploads).

---

## Data Persistence

All data is stored in named Docker volumes, which persist across container restarts and rebuilds:

| Volume | Mounted By | Contains |
|--------|-----------|----------|
| `mongodb_data` | `mongodb` | Database files |
| `redis_data` | `redis` | Redis persistence (RDB/AOF) |
| `minio_data` | `minio` | All object storage buckets and their contents |

> **Warning:** Removing Docker volumes (`docker compose down -v`) permanently deletes all data. Always create a backup before performing destructive operations.

### Migrating an existing production deployment

If you already ran production Compose **without** MongoDB authentication:

1. Back up MongoDB and MinIO data before any change.
2. Either provision a fresh volume (`docker compose -f docker-compose.prod.yml down -v` **destroys data**) and restore from backup, or manually enable auth and create users with `mongosh` (see MongoDB docs).
3. Set `MONGODB_ROOT_*`, `MONGODB_APP_*`, and a credentialed `MONGODB_URI` in `.env`.
4. Rotate `REDIS_PASSWORD`, MinIO keys, and add `MEDIA_SIGN_SECRET` (distinct from `JWT_SECRET`).
5. Remove any anonymous branding bucket policy in MinIO (`mc anonymous set none myminio/branding`).

Development Compose binds MongoDB, Redis, and MinIO to **127.0.0.1** only (not all interfaces). Branding is not publicly readable from MinIO; the app serves assets via signed URLs.

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

## Local development persistence

The root `docker-compose.yml` (used by `./scripts/dev-start.sh`) stores MongoDB, Redis, and MinIO on the **host** under `.docker-data/` via bind mounts. Data survives `docker compose down` and container removal.

- **Safe:** `docker compose stop`, `docker compose down` (without `-v`)
- **Risky:** `docker compose down -v`, `docker volume prune`, deleting `.docker-data/`

See **[DOCKER-DEV-DATA.md](../DOCKER-DEV-DATA.md)** for layout, `KANBOARD_DOCKER_DATA_DIR`, backups, and migrating from old named volumes.

---

## Next Steps

- [Environment Variables Reference](environment-variables.md) — fine-tune every configuration option.
- [Reverse Proxy Setup](reverse-proxy.md) — put Nginx or Caddy in front of Atlantisboard for TLS and domain-based access.
- [Creating the First Admin Account](first-admin-account.md) — register your first user and gain admin access.
