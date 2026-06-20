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
| `LOG_LEVEL` | `info` (development) / `error` (production) | Pino log level (`debug`, `info`, `warn`, `error`). When unset: `info` in development, `error` when `NODE_ENV=production`. Production Docker Compose sets `LOG_LEVEL=error` and uses `logging: driver: none` on the app container (no Docker log files). **Do not** set `LOG_LEVEL=info` in production `.env` — Compose reads `.env` and would override the error default. |

---

## MongoDB

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | `mongodb://localhost:27017/kanboard?replicaSet=rs0` | Connection string (replica set required for change streams). **Production:** must include username, password, and `replicaSet=` |
| `MONGODB_DB_NAME` | `kanboard` | Database name |
| `MONGODB_ROOT_USER` | _(production Compose)_ | MongoDB root user (first init only; store securely) |
| `MONGODB_ROOT_PASSWORD` | _(production Compose)_ | MongoDB root password |
| `MONGODB_APP_USER` | `kanboard_app` | Application database user (production Compose init) |
| `MONGODB_APP_PASSWORD` | _(production Compose)_ | Password for `MONGODB_APP_USER` |
| `ENABLE_CHANGE_STREAMS` | `true` | Enable MongoDB change streams for real-time sync |
| `DISABLE_CHANGE_STREAMS` | _(empty)_ | Force change streams off |

### Test / CI only

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_TEST_URI` | _(unset)_ | MongoDB URI for `bun test` DB-backed suites (`tests/helpers/testHelpers.ts`). Use a **separate database** from `MONGODB_URI` when possible (e.g. `kanboard_test`). Required with Redis for HTTP integration tests; see [tests/README.md](../../tests/README.md). |
| `TEST_BASE_URL` | `http://127.0.0.1:3000` | Optional base URL when reusing an already-running server during integration tests |
| `TEST_PORT` | _(ephemeral)_ | Override listen port when the test harness starts the server (normally `0` = OS-assigned) |

> **Important:** MongoDB must be configured as a replica set. Change Streams — the foundation of Atlantisboard's real-time collaboration — do not work without one. Even single-node deployments need a replica set. See the [Manual Installation](manual-install.md) guide for initialisation commands.

> **Production:** The application refuses to start when `MONGODB_URI` has no credentials. Production Docker Compose enables SCRAM authentication and creates a least-privilege app user. Example URI: `mongodb://kanboard_app:SECRET@mongodb:27017/kanboard?authSource=kanboard&replicaSet=rs0`

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
| `JWT_EXPIRES_IN` | `1d` | Session JWT lifetime (e.g. `1d`, `12h`, `30m`). Bare integers are seconds (`3600` = 1 hour). No sliding refresh — users must re-login after expiry. |
| `SESSION_SECRET` | _(must set)_ | Express session signing secret |
| `CSRF_SECRET` | _(must set)_ | CSRF token signing secret |
| `ENCRYPTION_KEY` | _(must set)_ | AES-256-GCM key for encrypting stored credentials (OAuth secrets, MySQL passwords, VAPID keys) |
| `MEDIA_SIGN_SECRET` | _(must set in production)_ | HMAC secret for signed branding/font/asset URLs. Must differ from `JWT_SECRET` |

> **Warning:** These five secrets are critical for application security. Generate each one independently with `openssl rand -base64 48`. Never share them, commit them to version control, or reuse the same value for multiple variables.

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

Google OAuth is only needed if you enable Google sign-in in [Login Options](admin-login-options.md). Create OAuth credentials in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and set the authorised redirect URI to `https://your-domain.com/api/v1/auth/google/callback`.

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

These variables are only used when the authentication method is set to **Google Login + Database Verification**. In this mode, after a user authenticates with Google, their email is verified against an external MySQL database using a configurable SQL query. See [Login Options](admin-login-options.md) for configuration details.

---

## MinIO / Object Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `MINIO_ENDPOINT` | `localhost` | **Internal** MinIO API hostname for the app (Docker Compose: `minio`). Must be reachable from the server process—not `MINIO_PUBLIC_ENDPOINT` or your CDN URL |
| `MINIO_PORT` | `9000` | MinIO API port |
| `MINIO_USE_SSL` | `false` | Use HTTPS for MinIO |
| `MINIO_REQUEST_TIMEOUT_MS` | `30000` | Socket timeout for MinIO SDK calls (ms); prevents hung attachment operations when the endpoint is misconfigured |
| `MINIO_ACCESS_KEY` | `minioadmin` | Application S3 access key (also used as MinIO root in dev when `MINIO_ROOT_*` unset) |
| `MINIO_SECRET_KEY` | `minioadmin` | Application S3 secret key |
| `MINIO_ROOT_ACCESS_KEY` | _(falls back to `MINIO_ACCESS_KEY`)_ | MinIO **server** root user (production Compose). Set separately from app keys for least privilege |
| `MINIO_ROOT_SECRET_KEY` | _(falls back to `MINIO_SECRET_KEY`)_ | MinIO server root password |
| `MINIO_UPLOAD_PART_SIZE_MB` | `128` | Multipart upload chunk size (16–256 MiB) |
| `MINIO_PUBLIC_ENDPOINT` | _(unset)_ | Browser-reachable MinIO hostname for presigned attachment URLs (e.g. `minio.example.com`). **Do not** set to Docker internal `minio` |
| `MINIO_PUBLIC_PORT` | `443` | Public MinIO API port (use `443` with TLS) |
| `MINIO_PUBLIC_USE_SSL` | `false` | Use HTTPS in presigned URLs |
| `S3_PUBLIC_URL` | _(unset)_ | Alternative to `MINIO_PUBLIC_*`: full public object-store base URL (e.g. `https://minio.example.com`) |
| `ATTACHMENT_PUBLIC_BASE` | _(unset)_ | Alias for `S3_PUBLIC_URL` when exposing attachments via CDN/public MinIO |
| `ATTACHMENT_DELIVERY_MODE` | `hybrid` | `hybrid` \| `signed` \| `proxy` — how attachments are streamed to browsers |
| `ATTACHMENT_SIGNED_URL_TTL_SEC` | `900` | Presigned GET TTL (60–3600 seconds) |
| `ATTACHMENT_HYBRID_SIGNED_MIN_BYTES` | `5242880` | Hybrid mode: sign files at or above this size (bytes) |

> **Production attachments:** Leave `MINIO_PUBLIC_*` unset to serve all media through same-origin `/api/v1/attachments/:id/file` (works with `media-src 'self'`). Set `MINIO_PUBLIC_ENDPOINT` (or `S3_PUBLIC_URL`) only when browsers must fetch large/video files directly from MinIO/CDN—and add that origin to your reverse proxy / MinIO CORS config.

> **Warning:** Change the default `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` in production. The defaults (`minioadmin` / `minioadmin`) are for development only.

> **Least privilege:** For production, set `MINIO_ROOT_ACCESS_KEY` / `MINIO_ROOT_SECRET_KEY` for the MinIO daemon and use **different** `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` for the app. Production Compose `minio-setup` creates a scoped user with read/write on application buckets only. Branding assets are served through the app via signed URLs—not anonymous MinIO access.

> **TLS:** Set `MINIO_USE_SSL=true` when MinIO is behind HTTPS. Set `REDIS_TLS=true` for managed Redis or internal TLS. Traffic on the default Docker bridge is plaintext unless TLS is enabled.

---

## Networking & Proxy

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated allowed CORS origins. Wildcard `*` rejected in production |
| `CORS_ALLOW_MISSING_ORIGIN` | `false` | Production only: set `true` to allow credentialed API calls with no `Origin` header (non-browser clients). Browsers and installed PWAs normally send `Origin`; leave unset unless you operate server-to-server integrations |
| `TRUST_PROXY_HOPS` | `1` | Number of trusted reverse proxy hops (Nginx/Caddy = 1) |
| `FORCE_HTTPS` | *(unset)* | When `true`, OAuth redirect URIs and request-derived origins use `https://` even if Node sees plain HTTP behind TLS termination. Admin **Login options → Google OAuth → Upgrade OAuth URLs to HTTPS** applies when unset |
| `OAUTH_REDIRECT_BASE` | *(unset)* | Public origin for OAuth redirects; falls back to `APP_URL`, then `CORS_ORIGIN` |
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
| `DISK_RESERVE_MB` | `500` | Minimum free disk space (MiB) kept for MongoDB writes and uploads; rejects writes/uploads when below |
| `MONGODB_DISK_CHECK_PATH` | `/` (or `BACKUP_LOCATION` parent) | Filesystem path checked for MongoDB volume free space (override on dedicated data mounts) |
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

> **Security:** Backup jobs use the MinIO Client (`mc`) with credentials from the app environment. Prefer a scoped `MINIO_ACCESS_KEY` (not root) so a compromised app process has limited object-store access. Never enable `POMPELMI_SKIP_SCAN=true` in production.

---

## Malware Scanning (ClamAV / Pompelmi)

Card and board-import uploads are scanned with **ClamAV** through the **Pompelmi** library. In Docker, scanning runs inside the **app container** (no separate ClamAV service).

### How `clamd` vs `clamscan` is chosen

On container start, the entrypoint reads Linux **`MemAvailable`** and sets the scan backend:

| Condition | Backend | RAM impact |
|-----------|---------|------------|
| `MemAvailable` ≥ `POMPELMI_CLAMD_MIN_RAM_MB` (default **2048**) | **`clamd`** | Daemon keeps signatures in RAM (~**200–400 MB** extra). Faster repeat scans. |
| Below threshold, or `POMPELMI_USE_CLAMD=false` | **`clamscan`** | On-demand scans only; uses OS page-cache warm, no long-lived daemon. |

**Important:** If you allocate **more than 2 GB of available memory** to the host/VM, Atlantisboard **automatically uses more RAM for malware scanning** because `clamd` starts. Size the machine accordingly (typically **4 GB+ total** for full-stack Docker with `clamd`).

| Variable | Default | Description |
|----------|---------|-------------|
| `POMPELMI_SKIP_SCAN` | `false` in production images | Set `true` only for local dev without ClamAV. **Never in production.** |
| `POMPELMI_USE_CLAMD` | `auto` | `auto` — pick from RAM threshold; `true` — force `clamd`; `false` — force `clamscan`. |
| `POMPELMI_CLAMD_MIN_RAM_MB` | `2048` | Minimum `MemAvailable` (MB) before `auto` starts `clamd`. |
| `POMPELMI_CLAMD_HOST` | `127.0.0.1` | `clamd` TCP host (set when using an external daemon). |
| `POMPELMI_CLAMD_PORT` | `3310` | `clamd` TCP port. |
| `CLAMAV_DB_DIR` | `/var/lib/clamav` | Signature database directory (Docker volume in Compose). |
| `POMPELMI_SCAN_TIMEOUT_MS` | `600000` | Max scan time per file (ms). |
| `POMPELMI_FAIL_OPEN` | `false` | If `true`, allow uploads when the scanner is unavailable (not recommended for production). |
| `POMPELMI_DB_PAGE_CACHE_WARM` | `true` | Warm kernel page cache for signature files (`clamscan` path). |
| `POMPELMI_SIGNATURE_REFRESH` | `true` | Scheduled `freshclam` + re-warm (default every 24 h). |

Startup logs show which mode is active, for example *Malware scanning via clamd* or *via on-demand clamscan*.

---

## Push Notifications (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `VAPID_SUBJECT` | _(empty)_ | VAPID subject for web push (e.g. `mailto:admin@example.com`) |

VAPID (Voluntary Application Server Identification) is required for Web Push notifications. Set this to a `mailto:` URL or a URL for your application. VAPID keys are generated automatically by the application and stored encrypted using `ENCRYPTION_KEY`.

---

## Email (SMTP)

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_TLS_INSECURE` | `false` | **Development only:** set `true` to skip SMTP TLS certificate verification (local mail sinks with self-signed certs). Ignored when `NODE_ENV=production` |

Admin UI SMTP settings use the same TLS policy: verification is always on in production.

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
- [ ] `LOG_LEVEL=error` (or leave unset — never `info` in production `.env`)
- [ ] `JWT_SECRET`, `SESSION_SECRET`, `CSRF_SECRET`, `ENCRYPTION_KEY`, `MEDIA_SIGN_SECRET` (five unique secrets)
- [ ] `APP_URL` and `CORS_ORIGIN` (your public domain)
- [ ] `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` (changed from defaults; scoped user recommended)
- [ ] `REDIS_PASSWORD` (≥32 characters)
- [ ] `MONGODB_URI` with credentials and `replicaSet=` (production Compose: also `MONGODB_ROOT_*` and `MONGODB_APP_PASSWORD`)

---

## Security testing (CI)

GitHub Actions (`.github/workflows/ci.yml`) runs `bun audit`, typecheck, and unit tests on each push/PR. **OWASP ZAP / DAST** is not yet automated in CI; run a baseline ZAP scan against a staging deployment before major releases until a workflow job is added (see internal security report INFRA-008).

---

## See Also

- [Docker Compose Installation](docker-compose-install.md) — where to place your `.env` file
- [Reverse Proxy Setup](reverse-proxy.md) — configuring `TRUST_PROXY_HOPS`, `CORS_ORIGIN`, and `APP_URL` for proxy deployments
- [Login Options](admin-login-options.md) — Google OAuth and external MySQL settings
