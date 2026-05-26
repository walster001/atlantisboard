---
layout: wiki
title: "Environment Variables Reference"
description: "Complete reference for every Atlantisboard environment variable, grouped by category."
parent: "Deployment & Installation"
nav_order: 5
permalink: /wiki/environment-variables/
---

# Environment Variables Reference

This page documents every environment variable recognised by Atlantisboard. Variables are configured in your `.env` file (or via your container orchestrator's environment configuration).

> **Tip:** Start by copying `.env.example` to `.env` and editing it. The example file includes comments and sensible defaults for development. For production, you must set all variables marked **(must set)**.

---

## Server

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Set to `production` for production deployments |
| `PORT` | `3000` | HTTP listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`) |

---

## MongoDB

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | `mongodb://localhost:27017/kanboard?replicaSet=rs0` | Connection string (replica set required for change streams) |
| `MONGODB_DB_NAME` | `kanboard` | Database name |
| `ENABLE_CHANGE_STREAMS` | `true` | Enable MongoDB change streams for real-time sync |
| `DISABLE_CHANGE_STREAMS` | _(empty)_ | Force change streams off |

> **Important:** MongoDB must be configured as a replica set. Change Streams — the foundation of Atlantisboard's real-time collaboration — do not work without one. Even single-node deployments need a replica set. See the [Manual Installation](/wiki/manual-install/) guide for initialisation commands.

---

## Redis

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_HOST` | `localhost` | Redis hostname (use `redis` in Docker Compose) |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | _(empty)_ | Redis AUTH password (required in production) |
| `REDIS_USERNAME` | _(empty)_ | Redis ACL username (Redis 6+) |
| `REDIS_TLS` | `false` | Enable TLS connections |
| `REDIS_TLS_REJECT_UNAUTHORIZED` | `true` | Verify server TLS cert |
| `REDIS_TLS_CA_PATH` | _(empty)_ | PEM CA bundle path for private CAs |
| `REDIS_CLUSTER` | `false` | Use Redis Cluster mode |
| `REDIS_CLUSTER_NODES` | _(empty)_ | Comma-separated cluster node addresses |
| `REDIS_CLUSTER_USE_REPLICAS` | `false` | Route read-only commands to replicas |

> **Tip:** For Docker Compose deployments, set `REDIS_HOST=redis` to use the container's service name. For production, always set a strong `REDIS_PASSWORD`.

---

## Security & Auth

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | _(must set)_ | Secret for signing JWTs. Generate: `openssl rand -base64 48` |
| `JWT_EXPIRES_IN` | `1h` | JWT token lifetime (e.g. `1h`, `30m`, `1d`) |
| `SESSION_SECRET` | _(must set)_ | Express session signing secret |
| `CSRF_SECRET` | _(must set)_ | CSRF token signing secret |
| `ENCRYPTION_KEY` | _(must set)_ | AES-256-GCM key for encrypting stored credentials (OAuth secrets, MySQL passwords, VAPID keys) |

> **Warning:** These four secrets are critical for application security. Generate each one independently with `openssl rand -base64 48`. Never share them, commit them to version control, or reuse the same value for multiple variables.

---

## Google OAuth (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | _(empty)_ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | _(empty)_ | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | `/api/v1/auth/google/callback` | OAuth redirect path |
| `GOOGLE_OAUTH_BROWSER_ORIGIN` | _(empty)_ | Origin for redirect URI (e.g. `https://boards.example.com`) |
| `GOOGLE_OAUTH_DEVICE_ID` | _(empty)_ | Device ID for LAN/private-IP OAuth flows |
| `GOOGLE_OAUTH_DEVICE_NAME` | _(empty)_ | Device name for LAN/private-IP OAuth flows |

Google OAuth is only needed if you enable Google sign-in in [Login Options](/wiki/admin-login-options/). Create OAuth credentials in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and set the authorised redirect URI to `https://your-domain.com/api/v1/auth/google/callback`.

> **Note:** For LAN or private-IP deployments, Google requires `device_id` and `device_name` parameters. Set `GOOGLE_OAUTH_DEVICE_ID` and `GOOGLE_OAUTH_DEVICE_NAME` in your `.env` file. See the Google OAuth documentation for details.

---

## External MySQL (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `EXTERNAL_MYSQL_HOST` | _(empty)_ | MySQL host for Google+DB verification |
| `EXTERNAL_MYSQL_PORT` | `3306` | MySQL port |
| `EXTERNAL_MYSQL_DATABASE` | _(empty)_ | MySQL database name |
| `EXTERNAL_MYSQL_USERNAME` | _(empty)_ | MySQL username |
| `EXTERNAL_MYSQL_PASSWORD` | _(empty)_ | MySQL password |
| `EXTERNAL_MYSQL_ENABLED` | `false` | Enable external MySQL verification |
| `MYSQL_ALLOWED_HOSTS` | _(empty)_ | Comma-separated allowlist for MySQL import host |

These variables are only used when the authentication method is set to **Google Login + Database Verification**. In this mode, after a user authenticates with Google, their email is verified against an external MySQL database using a configurable SQL query. See [Login Options](/wiki/admin-login-options/) for configuration details.

---

## MinIO / Object Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `MINIO_ENDPOINT` | `localhost` | MinIO server address (use `minio` in Docker Compose) |
| `MINIO_PORT` | `9000` | MinIO API port |
| `MINIO_USE_SSL` | `false` | Use HTTPS for MinIO |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO root user |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO root password |
| `MINIO_UPLOAD_PART_SIZE_MB` | `128` | Multipart upload chunk size (16–256 MiB) |

> **Warning:** Change the default `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` in production. The defaults (`minioadmin` / `minioadmin`) are for development only.

---

## Networking & Proxy

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated allowed CORS origins. Wildcard `*` rejected in production |
| `TRUST_PROXY_HOPS` | `1` | Number of trusted reverse proxy hops (Nginx/Caddy = 1) |
| `APP_URL` | `http://localhost:3000` | Public-facing application URL |
| `API_URL` | `http://localhost:3000/api/v1` | API base URL |

> **Important:** When deploying behind a reverse proxy, set `CORS_ORIGIN` and `APP_URL` to your public domain (e.g. `https://boards.example.com`). Set `TRUST_PROXY_HOPS=1` if you have a single proxy layer.

---

## Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_AUTH_ATTEMPTS` | `900` | Auth endpoint request limit per window |
| `RATE_LIMIT_AUTH_WINDOW` | `1` | Auth rate limit window (minutes) |
| `RATE_LIMIT_FILE_UPLOADS` | `10` | File upload request limit per window |
| `RATE_LIMIT_FILE_UPLOAD_WINDOW` | `1` | File upload window (minutes) |
| `RATE_LIMIT_GENERAL_API` | `1000` | General API request limit per window |
| `RATE_LIMIT_GENERAL_API_WINDOW` | `1` | General API window (minutes) |

Rate limits are enforced per IP address using Redis-backed counters. Adjust these values if you have many users behind a shared IP (e.g. corporate NAT) and are seeing false-positive rate limit errors.

---

## Upload Limits

| Variable | Default | Description |
|----------|---------|-------------|
| `CARD_ATTACHMENT_MAX_MB` | `50` | Max card attachment size in MB (1–1024) |
| `BOARD_IMPORT_MAX_MB` | `35` | Max board import file size in MB (5–250) |

> **Tip:** If you also use a reverse proxy, make sure its upload limit is at least as high as these values. For Nginx, set `client_max_body_size` accordingly.

---

## Backup

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKUP_LOCATION` | _(empty)_ | Absolute filesystem path for backup ZIP archives. Required for backup functionality |
| `BACKUP_MC_PATH` | `/usr/local/bin/mc` | Path to MinIO Client binary for bucket mirroring |
| `BACKUP_MC_MIRROR_ALIAS` | `local` | MinIO Client alias used during backup |

> **Note:** The `BACKUP_LOCATION` must be an absolute path on the server (e.g. `/var/backups/atlantisboard`). The directory must exist and be writable by the application process. When using Docker, mount a host volume to this path so backups are accessible outside the container.

---

## Push Notifications (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `VAPID_SUBJECT` | _(empty)_ | VAPID subject for web push (e.g. `mailto:admin@example.com`) |

VAPID (Voluntary Application Server Identification) is required for Web Push notifications. Set this to a `mailto:` URL or a URL for your application. VAPID keys are generated automatically by the application and stored encrypted using `ENCRYPTION_KEY`.

---

## Workers

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_CRON_JOBS_IN_MAIN` | _(empty)_ | Set `true` to run scheduled jobs in the main server process instead of a separate worker |

By default, scheduled background jobs (backups, cleanup tasks) run in a separate worker process. Set this to `true` if you prefer a single-process deployment, such as in resource-constrained environments.

---

## Quick Setup Checklist

For a minimal production deployment, make sure you have set:

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET`, `SESSION_SECRET`, `CSRF_SECRET`, `ENCRYPTION_KEY` (four unique secrets)
- [ ] `APP_URL` and `CORS_ORIGIN` (your public domain)
- [ ] `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` (changed from defaults)
- [ ] `REDIS_PASSWORD` (if Redis is network-accessible)
- [ ] `MONGODB_URI` (if not using the default Docker Compose setup)

---

## See Also

- [Docker Compose Installation](/wiki/docker-compose-install/) — where to place your `.env` file
- [Reverse Proxy Setup](/wiki/reverse-proxy/) — configuring `TRUST_PROXY_HOPS`, `CORS_ORIGIN`, and `APP_URL` for proxy deployments
- [Login Options](/wiki/admin-login-options/) — Google OAuth and external MySQL settings
