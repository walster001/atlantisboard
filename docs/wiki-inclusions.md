# Atlantisboard Wiki — Proposed Structure

> **Purpose**: This document defines the complete wiki structure for Atlantisboard. Each entry describes a page, its content scope, and image placeholders. A GitHub Actions automation job will convert these Markdown pages into searchable Jekyll pages themed to match the main site, replacing the current "Wiki" hyperlink.

---

## Conventions

- Every page lives in `docs/wiki/` as a flat Markdown file (no nested folders except `images/`).
- Filenames use kebab-case: `page-name.md`.
- Each page begins with a YAML front matter block for Jekyll (`title`, `description`, `parent`, `nav_order`).
- Image placeholders use the format `![ALT_TEXT](images/PLACEHOLDER_NAME.png)` — drop screenshots in later.
- Cross-page links use relative Markdown links: `[Link text](other-page.md)`.
- "Parent" references indicate sidebar nesting in the generated Jekyll site.

---

## Site Map

```
Home (index)
├── Getting Started
│   ├── What is Atlantisboard?
│   └── System Requirements
│
├── Deployment & Installation
│   ├── Docker Compose (Recommended)
│   ├── Environment Variables Reference
│   ├── Reverse Proxy Setup (Nginx / Caddy)
│   ├── Manual (Non-Docker) Installation
│   └── Updating & Maintenance
│
├── First-Time Setup
│   ├── Creating the First Admin Account
│   └── Initial Configuration Walkthrough
│
├── Admin Configuration
│   ├── General Settings
│   ├── Login Options
│   ├── Permissions & Roles
│   ├── User Management
│   ├── Email (SMTP) Configuration
│   ├── Database Maintenance
│   ├── Backup & Restore
│   └── System Monitor
│
├── Admin Customisation
│   ├── Login Branding
│   ├── App Branding
│   ├── Email Branding
│   └── Custom Fonts
│
├── Accounts & Authentication
│   ├── Registration & Sign-In
│   ├── Password Reset & Email Verification
│   └── Google OAuth Sign-In
│
├── User Account & Profile
│   ├── Profile Settings
│   ├── Password & Security
│   └── Notification Preferences
│
├── Home Screen & Workspaces
│   ├── The Home Page
│   ├── Workspaces
│   └── Creating & Managing Boards
│
├── Boards
│   ├── Board Overview
│   ├── Lists & Columns
│   ├── Cards
│   │   └── Card Detail
│   ├── Drag & Drop
│   ├── Filtering & Search
│   └── Real-Time Collaboration
│
├── Board Settings
│   ├── Card Settings
│   ├── List Settings
│   ├── Labels
│   ├── Users & Permissions
│   ├── Invites & Sharing
│   ├── Theme & Colouring
│   ├── Background
│   └── Audit Log
│
├── Themes
│   ├── Default Themes
│   ├── Custom Theme Editor
│   └── Sharing & Managing Themes
│
├── Import & Export
│   ├── Importing Boards
│   └── Exporting Boards
│
├── Offline & PWA
│
└── Keyboard Shortcuts & Tips
```

---

## Page-by-Page Specification

---

### 1. `Home.md` — Wiki Home

**Nav order**: 1  
**Parent**: _(root)_

**Content**:
- Welcome paragraph — what this wiki covers (using the app, deploying it, configuring it).
- Visual table of contents linking every section below.
- Note about Jekyll search: all pages are indexed and searchable from the sidebar.

---

### 2. `getting-started.md` — What is Atlantisboard?

**Nav order**: 2  
**Parent**: _(root)_

**Content**:
- One-paragraph product summary: self-hosted, real-time collaborative Kanban board.
- Core vocabulary: boards, workspaces, lists, cards, labels, members, roles.
- Technology at a glance (for the curious): Bun, React, MongoDB, Redis, MinIO.
- Overview of what the app looks like — first impression.

**Image placeholders**:
- `![Atlantisboard home screen overview](images/getting-started-overview.png)`

---

### 3. `system-requirements.md` — System Requirements

**Nav order**: 3  
**Parent**: Getting Started

**Content**:
- Minimum hardware (CPU, RAM, disk) for a small team vs. larger deployment.
- Required software:
  - Docker & Docker Compose (recommended path), OR
  - Bun >= 1.3.5, MongoDB 8.x (replica set required), Redis 7.x, MinIO.
- Network requirements: outbound for OAuth, SMTP; inbound port for the app.
- Browser support (modern evergreen browsers).

---

### 4. `docker-compose-install.md` — Docker Compose Installation (Recommended)

**Nav order**: 4  
**Parent**: Deployment & Installation

**Content**:
- Prerequisites checklist (Docker, Docker Compose, git).
- Step-by-step:
  1. Clone the repository.
  2. Copy `.env.example` to `.env`.
  3. Generate four secrets (`openssl rand -base64 48` for `JWT_SECRET`, `SESSION_SECRET`, `CSRF_SECRET`, `ENCRYPTION_KEY`).
  4. Configure essential `.env` values (see link to [Environment Variables Reference](environment-variables.md)).
  5. Run `docker compose -f docker-compose.prod.yml up -d`.
  6. Verify with `docker compose ps` and health checks.
  7. Access the app at `http://<host>:3000`.
- What each container does:
  - `mongodb` — MongoDB 8.0 database.
  - `redis` — Redis 7 Alpine for session store and rate-limit counters.
  - `minio` — S3-compatible object storage for attachments, branding assets, user avatars, custom fonts, and backups.
  - `minio-setup` — one-shot init container that creates the 7 required buckets (`import-inline`, `card-attachments`, `branding`, `fonts`, `user-avatars`, `backgrounds`, `backups`).
  - `app` — the Atlantisboard application (Bun runtime, multi-stage build, non-root user, serves frontend + API on port 3000).
- Data persistence: named Docker volumes for each service.
- Stopping / restarting / removing containers.

**Image placeholders**:
- `![Docker Compose architecture diagram](images/docker-compose-architecture.png)`

---

### 5. `environment-variables.md` — Environment Variables Reference

**Nav order**: 5  
**Parent**: Deployment & Installation

**Content**:
A reference table covering every `.env` variable grouped by category:

**Server**:

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Set to `production` for production deployments |
| `PORT` | `3000` | HTTP listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`) |

**MongoDB**:

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | `mongodb://localhost:27017/kanboard?replicaSet=rs0` | Connection string (replica set required for change streams) |
| `MONGODB_DB_NAME` | `kanboard` | Database name |
| `ENABLE_CHANGE_STREAMS` | `true` | Enable MongoDB change streams for real-time sync |
| `DISABLE_CHANGE_STREAMS` | _(empty)_ | Force change streams off |

**Redis**:

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

**Security & Auth**:

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | _(must set)_ | Secret for signing JWTs. Generate: `openssl rand -base64 48` |
| `JWT_EXPIRES_IN` | `1h` | JWT token lifetime (e.g. `1h`, `30m`, `1d`) |
| `SESSION_SECRET` | _(must set)_ | Express session signing secret |
| `CSRF_SECRET` | _(must set)_ | CSRF token signing secret |
| `ENCRYPTION_KEY` | _(must set)_ | AES-256-GCM key for encrypting stored credentials (OAuth secrets, MySQL passwords, VAPID keys) |

**Google OAuth** _(optional)_:

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | _(empty)_ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | _(empty)_ | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | `/api/v1/auth/google/callback` | OAuth redirect path |
| `GOOGLE_OAUTH_BROWSER_ORIGIN` | _(empty)_ | Origin for redirect URI (e.g. `https://boards.example.com`) |
| `GOOGLE_OAUTH_DEVICE_ID` | _(empty)_ | Device ID for LAN/private-IP OAuth flows |
| `GOOGLE_OAUTH_DEVICE_NAME` | _(empty)_ | Device name for LAN/private-IP OAuth flows |

**External MySQL** _(optional)_:

| Variable | Default | Description |
|----------|---------|-------------|
| `EXTERNAL_MYSQL_HOST` | _(empty)_ | MySQL host for Google+DB verification |
| `EXTERNAL_MYSQL_PORT` | `3306` | MySQL port |
| `EXTERNAL_MYSQL_DATABASE` | _(empty)_ | MySQL database name |
| `EXTERNAL_MYSQL_USERNAME` | _(empty)_ | MySQL username |
| `EXTERNAL_MYSQL_PASSWORD` | _(empty)_ | MySQL password |
| `EXTERNAL_MYSQL_ENABLED` | `false` | Enable external MySQL verification |
| `MYSQL_ALLOWED_HOSTS` | _(empty)_ | Comma-separated allowlist for MySQL import host |

**MinIO / Object Storage**:

| Variable | Default | Description |
|----------|---------|-------------|
| `MINIO_ENDPOINT` | `localhost` | MinIO server address (use `minio` in Docker Compose) |
| `MINIO_PORT` | `9000` | MinIO API port |
| `MINIO_USE_SSL` | `false` | Use HTTPS for MinIO |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO root user |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO root password |
| `MINIO_UPLOAD_PART_SIZE_MB` | `128` | Multipart upload chunk size (16–256 MiB) |

**Networking & Proxy**:

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated allowed CORS origins. Wildcard `*` rejected in production |
| `TRUST_PROXY_HOPS` | `1` | Number of trusted reverse proxy hops (Nginx/Caddy = 1) |
| `APP_URL` | `http://localhost:3000` | Public-facing application URL |
| `API_URL` | `http://localhost:3000/api/v1` | API base URL |

**Rate Limiting**:

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_AUTH_ATTEMPTS` | `900` | Auth endpoint request limit per window |
| `RATE_LIMIT_AUTH_WINDOW` | `1` | Auth rate limit window (minutes) |
| `RATE_LIMIT_FILE_UPLOADS` | `10` | File upload request limit per window |
| `RATE_LIMIT_FILE_UPLOAD_WINDOW` | `1` | File upload window (minutes) |
| `RATE_LIMIT_GENERAL_API` | `1000` | General API request limit per window |
| `RATE_LIMIT_GENERAL_API_WINDOW` | `1` | General API window (minutes) |

**Upload Limits**:

| Variable | Default | Description |
|----------|---------|-------------|
| `CARD_ATTACHMENT_MAX_MB` | `50` | Max card attachment size in MB (1–1024) |
| `BOARD_IMPORT_MAX_MB` | `35` | Max board import file size in MB (5–250) |

**Backup**:

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKUP_LOCATION` | _(empty)_ | Absolute filesystem path for backup ZIP archives. Required for backup functionality |
| `BACKUP_MC_PATH` | `/usr/local/bin/mc` | Path to MinIO Client binary for bucket mirroring |
| `BACKUP_MC_MIRROR_ALIAS` | `local` | MinIO Client alias used during backup |

**Push Notifications** _(optional)_:

| Variable | Default | Description |
|----------|---------|-------------|
| `VAPID_SUBJECT` | _(empty)_ | VAPID subject for web push (e.g. `mailto:admin@example.com`) |

**Workers**:

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_CRON_JOBS_IN_MAIN` | _(empty)_ | Set `true` to run scheduled jobs in the main server process instead of a separate worker |

---

### 6. `reverse-proxy.md` — Reverse Proxy Setup (Nginx / Caddy)

**Nav order**: 6  
**Parent**: Deployment & Installation

**Content**:
- Why you need a reverse proxy (TLS termination, HTTP/2, domain name, WebSocket upgrade).
- Environment variable alignment:
  - `TRUST_PROXY_HOPS=1` must be set.
  - `CORS_ORIGIN` and `APP_URL` must match your public domain.

**Nginx example** — complete `server` block:
- HTTPS with Let's Encrypt / certbot.
- `proxy_pass http://localhost:3000`.
- WebSocket upgrade headers for Socket.io (`Upgrade`, `Connection`).
- Recommended headers (`X-Forwarded-For`, `X-Forwarded-Proto`, `Host`).
- Client max body size for large uploads (`client_max_body_size 100m`).
- Static asset caching hints.

**Caddy example** — complete Caddyfile:
- Automatic TLS.
- `reverse_proxy localhost:3000`.
- WebSocket support (automatic in Caddy).

**Image placeholders**:
- `![Reverse proxy architecture](images/reverse-proxy-diagram.png)`

---

### 7. `manual-install.md` — Manual (Non-Docker) Installation

**Nav order**: 7  
**Parent**: Deployment & Installation

**Content**:
- When to use manual install (custom infrastructure, restrictions on Docker).
- Install prerequisites: Bun >= 1.3.5, MongoDB 8.x with replica set, Redis 7.x, MinIO.
- Clone repo, `bun install`, `bun run build`.
- Configure `.env` (same variables as Docker path).
- Start the application: `bun run dist/server/index.js`.
- Optional: run the background worker process separately: `bun run dist/server/workers/index.js` (handles scheduled backups, cleanup jobs).
- systemd service file example for auto-start.
- MongoDB replica set initialisation commands.

---

### 8. `updating.md` — Updating & Maintenance

**Nav order**: 8  
**Parent**: Deployment & Installation

**Content**:
- Docker path: `git pull`, `docker compose -f docker-compose.prod.yml build`, `docker compose up -d`.
- Manual path: `git pull`, `bun install`, `bun run build`, restart process.
- Pre-update checklist: create backup (Admin → Backup), check release notes.
- Rolling back to a previous version.

---

### 9. `first-admin-account.md` — Creating the First Admin Account

**Nav order**: 9  
**Parent**: First-Time Setup

**Content**:
- On first launch with zero users, registration is always open regardless of the configured registration mode.
- The first registered user is automatically promoted to **App Admin** (and marked as the founding admin).
- Password requirements: minimum 12 characters, strength meter (uppercase, lowercase, number, special character).
- Verifying admin status after login: admin badge in user menu, access to Admin Configuration page.
- What if registration is accidentally set to "disabled" with no users: the first-user bypass still works.

**Image placeholders**:
- `![First registration screen](images/first-admin-register.png)`

---

### 10. `initial-configuration.md` — Initial Configuration Walkthrough

**Nav order**: 10  
**Parent**: First-Time Setup

**Content**:
- Recommended order of first-time configuration:
  1. **Login Options** — choose authentication methods, set registration mode, optionally configure Google OAuth.
  2. **Email (SMTP)** — configure so password resets, email verification, and invitations work. Send a test email to verify.
  3. **Permissions & Roles** — review the three built-in roles (Admin, Manager, Viewer), create custom roles if needed.
  4. **Backup** — set the `BACKUP_LOCATION` environment variable, configure retention, test a manual backup.
  5. **Customisation** — brand the login page and app navbar with your logo, colours, and fonts.
- Links to each detailed admin page.

---

### 11. `admin-general.md` — Admin: General Settings

**Nav order**: 11  
**Parent**: Admin Configuration

**Content**:
- Overview of the General tab.
- Future: application name, default language, timezone, and other global preferences.

> _Note: This tab is reserved for upcoming settings. The page serves as a placeholder in the wiki structure._

---

### 12. `admin-login-options.md` — Admin: Login Options

**Nav order**: 12  
**Parent**: Admin Configuration

**Content**:
- **Login Style** card:
  - **Authentication Method** selector:
    - Local Accounts — email/password only.
    - Local Accounts + Google — both methods available.
    - Google Login Only — no local password accounts.
    - Google Login + Database Verification — Google sign-in verified against an external MySQL database.
  - **Registration Mode** selector:
    - Open registration — anyone can create an account.
    - Invite-only — only users with a valid invite link can register.
    - Disabled — no new registrations (existing users can still log in).
  - **Mandatory email verification** toggle — require new users to verify their email before signing in. Auto-forced on when Google OAuth is configured alongside local accounts.
- **Google OAuth Configuration** card _(shown when auth method includes Google)_:
  - Client ID and Client Secret fields (stored encrypted server-side).
  - Callback URL configuration.
  - "Replace credentials" button for updating stored OAuth secrets.
- **External Database Configuration** card _(shown only for Google + Database Verification mode)_:
  - Host, port, database name, username, password fields.
  - Verification SQL query text area — a parameterised `SELECT` with `?` placeholder for the user's email.
  - "Test Connection" button.
  - "Save Configuration" button.
  - "Replace credentials" button for updating stored MySQL secrets.

**Image placeholders**:
- `![Login options panel](images/admin-login-options.png)`
- `![Google OAuth configuration](images/admin-google-oauth.png)`
- `![Registration mode selector](images/admin-registration-mode.png)`

---

### 13. `admin-permissions.md` — Admin: Permissions & Roles

**Nav order**: 13  
**Parent**: Admin Configuration

**Content**:
- Overview of the role-based permission system (RBAC with hierarchy levels).
- **App Admins** sub-panel — grant/revoke global App Admin access via user search.
- **Built-in roles** (read-only, cannot be deleted):
  - **Admin** — full workspace and board administration.
  - **Manager** — day-to-day board operations with constrained hierarchy.
  - **Viewer** — read-only collaboration role.
- **Custom roles** — create additional roles with:
  - Name and description.
  - Numeric hierarchy level (determines which roles a user can assign to others).
- **Permission categories** (15 total, each with individual toggles and a tri-state "toggle all" control):
  - Workspaces, Boards, Board Settings, Theme & Background, Members, Columns, Cards, Labels, Attachments, Comments, Checklists, Invites, Import, Export, Other.
- **Member role update hierarchy mode** — controls which hierarchy levels a role can assign:
  - Same only, Lower only, Higher only, Same or higher, Same or lower, Any.

**Image placeholders**:
- `![Permissions & roles panel](images/admin-permissions.png)`
- `![Custom role creation](images/admin-permissions-custom-role.png)`

---

### 14. `admin-users.md` — Admin: User Management

**Nav order**: 14  
**Parent**: Admin Configuration

**Content**:
- User list view — searchable, sortable table of all registered users.
- **Columns displayed**: Import Boards capability, Create Workspace capability, Full name, Email, Username, App Admin status, Created At, Last Login, Email Verified, Auth Provider, Actions.
- **Per-user capability toggles**: Import Boards, Create Workspace (with master checkbox for all).
- **Actions available** per user:
  - Promote / demote App Admin.
  - Lock / unlock user account.
  - Delete user (removes from all boards/workspaces, purges data).
- **Batch save** for capability changes.

**Image placeholders**:
- `![User management panel](images/admin-users.png)`
- `![User actions](images/admin-user-actions.png)`

---

### 15. `admin-email.md` — Admin: Email (SMTP) Configuration

**Nav order**: 15  
**Parent**: Admin Configuration

**Content**:
- Why email matters: password resets, email verification, board invitations.
- **Enable SMTP email** master toggle.
- **SMTP Provider** selector — preconfigured options auto-fill host, port, and TLS:
  - Custom, Gmail, Mailgun, Postmark, SES, SendGrid, Brevo.
- Configuration fields:
  - SMTP host, port (1–65535, default 587), secure (TLS/SSL) toggle.
  - Username and password (badge shows if password is already stored).
  - From address and from name.
- **Send Test Email** section — recipient email field + send button. Verifies configuration using saved settings.
- Troubleshooting common SMTP errors (connection refused, authentication failed, TLS handshake).

**Image placeholders**:
- `![SMTP configuration panel](images/admin-email-smtp.png)`
- `![SMTP provider selector](images/admin-email-provider.png)`

---

### 16. `admin-database.md` — Admin: Database Maintenance

**Nav order**: 16  
**Parent**: Admin Configuration

**Content**:
- **Statistics grid** (read-only): database name, MongoDB version, storage size (MB), total documents, collection count, removable (safe) count.
- **Unknown collections** — informational badges for collections not part of the app schema.
- **Collections table** — name, document count, status (Known/Unknown).
- **Manual cleanup** — 16 cleanup categories, each with a "Clean" button:
  - Stale import jobs, stale backup jobs, expired sessions, expired notifications.
  - Orphan lists (no parent board), orphan cards (no board or no list), orphan labels, orphan boards (no workspace).
  - Orphan activities (no board or no card), orphan import placeholders, orphan invite links.
  - Orphan notifications (no user, no board, or no card), orphan import jobs (no user).
- **"Clean all safe"** batch button — runs all safe categories at once.
- **Refresh** button.

**Image placeholders**:
- `![Database maintenance panel](images/admin-database.png)`
- `![Cleanup categories](images/admin-database-cleanup.png)`

---

### 17. `admin-backup.md` — Admin: Backup & Restore

**Nav order**: 17  
**Parent**: Admin Configuration

**Content**:
- **Backup location** — configured via `BACKUP_LOCATION` environment variable (must be an absolute path on the server host). Displayed read-only in the panel.
- **Retention** — number of days to keep old backups (1–3650 days, persisted separately).
- **Manual backup** — "Create Backup" button opens a modal with a custom filename field. Creates a ZIP archive containing:
  - Full MongoDB database dump (BSON collections).
  - MinIO bucket mirror (attachments, branding, avatars, fonts, backups).
- **Scheduled backups**:
  - "Create Scheduled Backup" button — set frequency in days (1–3650).
  - Schedule status displayed: "Every N day(s)" or "Disabled".
  - Last scheduled run timestamp.
- **Backup history table** — folder/filename, created date, size, with actions:
  - **Restore** — confirmation modal requiring you to type the exact folder ID. Progress bar with phase and percentage during restore.
  - **Delete** — remove a backup archive.
- Backup job polling — progress indicator during backup creation.

**Image placeholders**:
- `![Backup panel](images/admin-backup.png)`
- `![Backup history list](images/admin-backup-history.png)`
- `![Restore confirmation](images/admin-backup-restore.png)`

---

### 18. `admin-monitor.md` — Admin: System Monitor

**Nav order**: 18  
**Parent**: Admin Configuration

**Content**:
- Real-time system health dashboard powered by WebSocket.
- **Host info bar** (read-only): hostname, OS, kernel, processor, temperature, process count.
- **Usage gauges** (3 animated progress bars):
  - CPU Usage — percentage, cores, load average.
  - Memory — percentage, used/total.
  - Disk — percentage, used/total.
- **Trend charts** (3 line charts): CPU trend (orange), Memory trend (blue), Disk trend (teal).
- **Runtime metrics grid** (read-only):
  - Uptime window.
  - Databases (size).
  - Docker (running/total containers with names tooltip).
  - Backups (count).
  - Disk Read/Write (bytes/sec).
  - Bandwidth Up/Down (bytes/sec).
- Health check endpoint: `GET /health`.

**Image placeholders**:
- `![System monitor dashboard](images/admin-monitor.png)`
- `![Monitor trend charts](images/admin-monitor-charts.png)`

---

### 19. `admin-login-branding.md` — Customisation: Login Branding

**Nav order**: 19  
**Parent**: Admin Customisation

**Content**:
- **Live preview pane** — real-time preview of the login page (same components as the real login, rendered read-only). Updates shortly after you stop typing.
- **Custom Login Background** card:
  - Enable/disable custom background toggle.
  - Background type selector: Solid Colour or Gradient.
  - Background colour picker (default: `#1f68b5`).
  - Gradient end colour picker (default: `#e7f5ff`, shown when gradient selected).
- **Login Box Style** card:
  - Segmented control: Box (centered card) or Fullscreen layout.
- **Login Box & Button Styling** card:
  - Login box background colour (default: `#ffffff`).
  - Google button background colour (default: `#ffffff`) and text colour (default: `#000000`).
  - Input title colour (default: `#495057`).
  - Link title colour (default: `#228be6`).
  - Sign-in button colour (default: `#228be6`) and text colour (default: `#ffffff`).
- **Custom Login Logo** card:
  - Enable/disable logo display toggle.
  - Upload logo image (PNG, JPEG, WebP, SVG; max 5 MB).
  - Logo size selector (predefined pixel options).
  - Logo displayed with circular crop on the login page.
  - Remove logo button.
- **Custom App Name** card:
  - Enable/disable app name on login screen.
  - Application name text input.
  - Font family selector (System UI + any uploaded custom fonts).
  - Font size selector (32 / 36 / 40 / 44 / 48 / 56 px).
  - Colour picker (default: `#1f68b5`).
- **Custom Tagline** card:
  - Enable/disable tagline.
  - Tagline text input.
  - Font family, size (14 / 16 / 18 / 20 / 22 / 24 px), and colour (default: `#868e96`) selectors.
- **Browser Tab & Favicon** card:
  - Enable/disable custom browser tab title + text input.
  - Enable/disable custom favicon.
  - Upload favicon (PNG, ICO, SVG, WebP; max 512 KB).
- **Save Changes** and **Reset Defaults** (confirmation modal) buttons.

**Image placeholders**:
- `![Login branding panel with live preview](images/admin-login-branding.png)`
- `![Login logo upload](images/admin-login-logo-upload.png)`
- `![Login branding preview example](images/admin-login-branding-preview.png)`

---

### 20. `admin-app-branding.md` — Customisation: App Branding

**Nav order**: 20  
**Parent**: Admin Customisation

**Content**:
- **Live preview pane** — shows homepage navbar and board-style navbar examples. Updates shortly after you stop typing.
- **Homepage Navbar Icon** card:
  - "Use custom favicon (under Login Branding)" checkbox — reuses the login favicon when no custom icon is uploaded.
  - Custom navbar icon upload (PNG, JPEG, WebP, SVG; max 5 MB).
  - Icon size selector (18–75 px, 1 px increments).
- **Homepage Navbar Label** card:
  - "Inherit text from custom app name" checkbox — uses the app name from Login Branding.
  - Custom label text input.
- **Homepage Navbar Text Colour** card — colour picker (default: `#212529`).
- **Homepage Navbar Background Colour** card — colour picker (default: `#ffffff`).
- **Homepage Background** card:
  - Mode selector: Background Colour or Background Image.
  - Page background colour picker (default: `#f8f9fa`).
  - Background image upload (PNG, JPEG, WebP; max 10 MB, auto-resized to 2400 px max edge).
- **Board Navbar Icon** card:
  - "Use same icon as homepage navbar" checkbox.
  - Board icon image upload (disabled when "same as home" is checked).
  - Icon size selector (18–75 px).
- **Default UI Font** — select a default font for the entire application UI (System UI, Poppins, or any uploaded custom font).
- **Save Changes** and **Reset Defaults** (confirmation modal) buttons.

**Image placeholders**:
- `![App branding panel with live preview](images/admin-app-branding.png)`
- `![Homepage navbar preview](images/admin-app-branding-navbar.png)`

---

### 21. `admin-email-branding.md` — Customisation: Email Branding

**Nav order**: 21  
**Parent**: Admin Customisation

**Content**:
- **Live preview pane** with template selector (e.g. password-reset, email verification) to preview different email types.
- **Colours** card:
  - Background colour (default: `#f2efe5`).
  - Text colour (default: `#38322d`).
  - Button colour (default: `#1a1a1a`) and button text colour (default: `#ffffff`).
  - Link colour (default: `#4da6d8`).
- **Footer** card:
  - Custom footer text input (supports `{{appName}}` placeholder variable).
- **Save Changes** button.

**Image placeholders**:
- `![Email branding panel](images/admin-email-branding.png)`
- `![Branded email preview](images/admin-email-branding-preview.png)`

---

### 22. `admin-custom-fonts.md` — Customisation: Custom Fonts

**Nav order**: 22  
**Parent**: Admin Customisation

**Content**:
- **Default UI Font** selector — choose the app-wide default font: Poppins (default), System UI, or any uploaded custom font.
- **Upload a font** — file input accepting `.woff2`, `.woff`, `.ttf`, `.otf` files + upload button.
- **Uploaded fonts catalog** — list of all uploaded fonts with a "Remove" button each (confirmation modal).
- Where custom fonts appear:
  - Login branding: app name and tagline font selectors.
  - App branding: default UI font selector.
- Font file storage: MinIO `fonts` bucket.

**Image placeholders**:
- `![Custom fonts panel](images/admin-custom-fonts.png)`
- `![Font upload and catalog](images/admin-fonts-catalog.png)`

---

### 23. `accounts-auth.md` — Accounts & Authentication: Registration & Sign-In

**Nav order**: 23  
**Parent**: Accounts & Authentication

**Content**:
- **Registration** (when enabled):
  - Fields: display name, username, email, password, confirm password.
  - Password requirements: minimum 12 characters, strength meter (5 segments: length, uppercase, lowercase, number, special character).
  - If mandatory email verification is enabled, a "check your email" view appears after registration with a resend link (10-minute token expiry).
  - First user bypass: if no users exist, registration is always open.
  - The first registered user is automatically promoted to App Admin.
- **Sign-in** with email and password.
- **Registration modes** (configured by admin):
  - Open — sign-up link visible on login page.
  - Invite-only — sign-up only available via invite link.
  - Disabled — sign-up hidden; only existing accounts can log in.
- **Account lockout** — account is locked after 3 consecutive failed login attempts.

**Image placeholders**:
- `![Login page](images/auth-login.png)`
- `![Registration form](images/auth-register.png)`

---

### 24. `password-reset.md` — Accounts & Authentication: Password Reset & Email Verification

**Nav order**: 24  
**Parent**: Accounts & Authentication

**Content**:
- **Forgot password** flow:
  1. Click "Forgot password?" on the login page.
  2. Enter your email address.
  3. Receive a reset link via email (requires SMTP configured by admin).
  4. Set a new password on the reset page (same strength requirements as registration).
  5. Auto-redirects to login after 2 seconds.
- **Email verification**:
  - After registration (if mandatory verification is enabled), check your inbox for a verification link.
  - "Resend verification" option available.
  - Verified status visible in the admin user management panel.

**Image placeholders**:
- `![Forgot password modal](images/auth-forgot-password.png)`
- `![Reset password page](images/auth-reset-password.png)`

---

### 25. `google-oauth.md` — Accounts & Authentication: Google OAuth Sign-In

**Nav order**: 25  
**Parent**: Accounts & Authentication

**Content**:
- How Google sign-in works: click the Google button on the login page, authenticate with Google, return to the app.
- **Account merge**: if a local account exists with the same email, the Google identity is linked to it.
- **Google + Database Verification** mode: after Google authenticates the user, the app verifies the email against an external MySQL database using a configurable SQL query.
- Error scenarios explained: email conflict, unverified account, missing email from Google, registration disabled/invite-only.
- LAN/private IP setup: Google requires `device_id` and `device_name` parameters; configurable via environment variables.

**Image placeholders**:
- `![Google sign-in button](images/auth-google.png)`

---

### 26. `user-profile.md` — User Account: Profile Settings

**Nav order**: 26  
**Parent**: User Account & Profile

**Content**:
- Accessing profile settings: click your avatar/name in the top-right corner → "Profile" from the dropdown.
- **Profile Settings Modal**:
  - **Display name** — editable text field.
  - **Avatar** — upload an image (JPEG, PNG, WebP); auto-resized to a square. Remove option restores Google profile picture if a Google account is linked.
  - **Language** — selector with English, Spanish, French, German + Autodetect/Translate options.
- Saving profile changes (unified save button).

**Image placeholders**:
- `![User menu dropdown](images/user-menu.png)`
- `![Profile settings modal](images/user-profile.png)`

---

### 27. `user-security.md` — User Account: Password & Security

**Nav order**: 27  
**Parent**: User Account & Profile

**Content**:
- **Change password** — current password + new password + confirm. Same strength meter as registration.
- **Account lockout** — after 3 failed login attempts, the account is temporarily locked. An admin can unlock it from the User Management panel.
- **App-wide theme preference** — light, dark, or auto (system preference).
- Link to [Password Reset & Email Verification](password-reset.md) for forgot-password flow.

**Image placeholders**:
- `![Change password form](images/user-change-password.png)`

---

### 28. `user-notifications.md` — User Account: Notification Preferences

**Nav order**: 28  
**Parent**: User Account & Profile

**Content**:
- **Notification categories**: Reminders, Assignments, Comments, Mentions, Invites.
- **Per-category toggles**: In-App, Push, SMS.
- **Push notification setup**: enabling browser notifications (Web Push / VAPID).
- In-app notifications: Mantine toast notifications for real-time events (import progress, card changes, errors).

**Image placeholders**:
- `![Notification preferences](images/user-notifications.png)`

---

### 29. `home-page.md` — The Home Page

**Nav order**: 29  
**Parent**: Home Screen & Workspaces

**Content**:
- Home page layout overview.
- **Navigation bar**: customisable brand icon and label (from App Branding), user menu with avatar.
- **Workspace sections**: each workspace is a row with its boards displayed as tile cards.
- **Board tile cards**: show board name, background colour/theme, quick-access context menu.
- **Drag-and-drop workspace reordering**: drag workspace rows to change their order (persisted per user).
- **Drag-and-drop board reordering**: move board tiles between workspaces.
- **Create Workspace** button (permission-gated).
- **Import** button (permission-gated).
- Responsive layout: desktop grid vs. mobile stack.
- **Empty state**: "No workspaces yet" message with guidance for new users.

**Image placeholders**:
- `![Home page overview](images/home-page.png)`
- `![Board tiles grid](images/home-board-tiles.png)`

---

### 30. `workspaces.md` — Workspaces

**Nav order**: 30  
**Parent**: Home Screen & Workspaces

**Content**:
- What workspaces are: organisational containers for grouping related boards.
- **Creating a workspace**: name (max 100 characters), optional description (max 500 characters).
- **Workspace context menu** (right-click or three-dot menu on home page):
  - Rename workspace.
  - Edit description.
  - Workspace settings.
  - Delete workspace (owner only).
- **Workspace members**: add/remove members, assign roles, view member list.
- **Activity log retention**: configurable per workspace (1–365 days, default 30).
- Moving boards between workspaces (drag on the home page).

**Image placeholders**:
- `![Workspace on home page](images/workspaces.png)`
- `![Workspace context menu](images/workspace-context-menu.png)`

---

### 31. `creating-boards.md` — Creating & Managing Boards

**Nav order**: 31  
**Parent**: Home Screen & Workspaces

**Content**:
- **Create Board** modal:
  - Board name (required, max length with live character counter).
  - Description (optional, max length with live counter).
  - Theme selection from available system + custom themes.
  - Workspace is determined by which workspace section you click "Add Board" in.
- **Board visibility**: private (default), workspace, or public.
- **Board card context menu** (from the home page tile):
  - Rename board.
  - Edit description.
  - Change colour (background preset picker).
  - Export board.
  - Delete board (confirmation modal).

**Image placeholders**:
- `![Create board dialog](images/create-board.png)`
- `![Board card context menu](images/board-card-menu.png)`

---

### 32. `board-overview.md` — Board Overview

**Nav order**: 32  
**Parent**: Boards

**Content**:
- Board page layout: navbar at top, horizontally scrollable lists below.
- **Board navbar**: back button (returns to home), brand icon (customisable via App Branding), board title, offline notice (notification only when unreachable — no badge while online), invites button, settings button, user menu avatar.
- Scrolling and navigation: horizontal scroll for lists, vertical scroll within each list.
- Board loading states; real-time sync is silent when online (offline notification when unreachable).
- Horizontal virtualisation for boards with many lists (performance optimisation).

**Image placeholders**:
- `![Board overview](images/board-overview.png)`
- `![Board navbar](images/board-navbar.png)`

---

### 33. `lists.md` — Lists & Columns

**Nav order**: 33  
**Parent**: Boards

**Content**:
- What lists are: vertical columns that organise cards into workflow stages.
- **Creating a list**: "Add list" button at the end of the board, type a name.
- **Renaming a list**: click the title to edit inline.
- **Reordering lists**: drag the list header left/right.
- **List actions menu** (accessible from the list header):
  - Set list colour (applies to the list header; option to apply colour to all cards in the list).
  - Rename list.
  - Delete list (confirmation — removes the list and all its cards).
- **List width** — adjustable via Board Settings → List Settings (140–800 px).
- **WIP limits** — work-in-progress card count limits per list (1–100,000), with hard limit (blocks new cards) or soft limit (warning only).
- **Card counter** — optional card count badge in the list header (toggle in Card Settings).

**Image placeholders**:
- `![Lists on a board](images/lists.png)`
- `![List actions menu](images/list-actions.png)`

---

### 34. `cards.md` — Cards

**Nav order**: 34  
**Parent**: Boards

**Content**:
- What cards are: individual tasks/items within a list.
- **Creating a card**: "Add card" button at the bottom of a list, type a title.
- **Card preview** on the board shows (each toggleable in Card Settings):
  - Cover image (if set).
  - Card background colour tint.
  - Title (with emoji rendering).
  - Description preview (2-line preview or icon-only indicator).
  - Label colour chips.
  - Date badges (start, due, end — with icons and status colours).
  - Assignee avatars (up to 4 shown, with `+N` overflow).
  - Checklist progress indicator.
  - Attachment count indicator.
  - Comment count indicator.
- **Opening a card**: click to view the full card detail modal.
- **Card context menu** (three-dot button): quick access to card colour, rename, and more.

**Image placeholders**:
- `![Card on the board](images/card-preview.png)`
- `![Card with badges](images/card-badges.png)`

---

### 35. `card-detail.md` — Card Detail

**Nav order**: 35  
**Parent**: Boards

**Content**:
The card detail modal with all sections:

- **Title**: click to edit inline.
- **Description**: rich-text editor (Tiptap) with Markdown support, formatting toolbar (bold, italic, code, links), code blocks with syntax highlighting, emoji picker, inline button extension.
- **Start Date**: date + time picker, set/clear (permission-gated: `cards.dates.start.edit`).
- **Due Date**: date + time picker, set/clear (permission-gated: `cards.dates.due.edit`). Status colours: upcoming, overdue, complete.
- **End Date**: date + time picker, set/clear (permission-gated: `cards.dates.end.edit`).
- **Reminders**: up to 3 reminders per card, tied to the card's due date. Each has a trigger time, optional repeat frequency, and sent/dismissed status. Add, edit, dismiss, and delete.
- **Labels**: add/remove colour-coded labels from the board's label set.
- **Assignees**: assign/unassign board members to the card.
- **Checklists**:
  - Add multiple named checklists per card.
  - Add items to each checklist.
  - Check/uncheck items (with completion timestamp).
  - Checklist progress bar.
  - Drag to reorder items.
  - Delete individual items or entire checklists.
- **Comments**:
  - Add a comment (plain text field + Save).
  - Delete your own comments (delete others' requires `comments.delete` permission).
  - Real-time sync on create/delete (no typing preview while another user composes).
  - Comment timestamps and author avatars.
- **Attachments**:
  - Upload files (drag-and-drop or file picker).
  - File size limit (configurable via `CARD_ATTACHMENT_MAX_MB`, default 50 MB).
  - Attachment list with download links.
  - Image attachment previews.
  - Delete attachments.
  - Import placeholder attachments (from board imports).
- **Activity feed**: chronological log of all changes made to this card.
- **Card cover**: set an attachment image as the card cover (displayed on the board preview).
- **Card colour**: set a background colour tint for this card.
- **Duplicate card**: copy to a target list within the same board.
- **Delete card**: permanently remove (confirmation).
- **Mobile**: swipe-down gesture to close the card detail modal.

**Image placeholders**:
- `![Card detail modal](images/card-detail.png)`
- `![Card description editor](images/card-description.png)`
- `![Card checklist](images/card-checklist.png)`
- `![Card comments](images/card-comments.png)`
- `![Card attachments](images/card-attachments.png)`
- `![Card reminders](images/card-reminders.png)`

---

### 36. `drag-and-drop.md` — Drag & Drop

**Nav order**: 36  
**Parent**: Boards

**Content**:
- How drag-and-drop works: delegated pointer-based implementation using `@atlaskit/pragmatic-drag-and-drop`.
- **Dragging cards**: reorder within a list or move between lists. Permission-gated by `cards.move` and `cards.reorder`.
- **Dragging lists**: reorder columns on the board. Permission-gated by `lists.reorder`.
- **Touch device support**: long-press to initiate drag (configurable arming gesture).
- **Visual feedback**: drop indicators, drag preview rendering, placeholder shadows.
- **Home page drag-and-drop**: reorder workspace rows and move board tiles between workspaces.

**Image placeholders**:
- `![Dragging a card between lists](images/drag-and-drop.png)`

---

### 37. `filtering-search.md` — Filtering & Search

**Nav order**: 37  
**Parent**: Boards

**Content**:
- **Board filter bar**: filter cards by label, member, due date status.
- **Search**: search for cards by title or description content.
- **Active filter indicators** on the board.
- **Clearing filters**.
- Per-component search in: board member management, label management, admin user list.

**Image placeholders**:
- `![Filter bar on a board](images/board-filter.png)`

---

### 38. `real-time.md` — Real-Time Collaboration

**Nav order**: 38  
**Parent**: Boards

**Content**:
- How real-time works: MongoDB Change Streams detect database changes, Socket.io broadcasts them to connected clients.
- **7 change streams** watching: Workspaces, Boards, Lists, Cards, Activities, Labels, Invite Links.
- What updates in real-time:
  - Card creation, edits, moves, deletes.
  - List creation, reordering, deletion.
  - Comments and checklist updates.
  - Label and member changes.
  - Board settings and theme changes.
  - Workspace changes.
  - Invite link creation/deletion.
- **Comments**: sync on create/delete via card updates; no typing indicator in the UI.
- **User presence**: server emits `user:joined` / `user:left` (not shown in UI today).
- **Delta mode**: only changed fields are sent, reducing bandwidth.
- **Offline notice**: persistent notification when offline; no “live” connection badge while online.
- **Reconnection behaviour**: automatic with up to 5 attempts and 1–5 second backoff.
- **Requirements**: MongoDB replica set must be configured; change streams can be disabled via environment variables.

---

### 39. `board-settings-card.md` — Board Settings: Card Settings

**Nav order**: 39  
**Parent**: Board Settings

**Content**:
- Accessing board settings: click the gear icon on the board navbar.
- **Board Settings → Board Settings tab → Card Settings** sub-panel.
- Toggle switches controlling card metadata visibility on the board:
  - **Start date on cards** — show/hide start date badges.
  - **Due date on cards** — show/hide due date badges.
  - **End date on cards** — show/hide end date badges.
  - **Reminders** — show/hide reminder controls.
  - **Labels** — show/hide label colour chips.
  - **Assignees** — show/hide assignee avatars.
  - **Checklist** — show/hide checklist progress indicator.
  - **Attachments** — show/hide attachment count indicator.
  - **Comments** — show/hide comment count indicator.
  - **Card counter on lists** — show/hide the card count badge in list headers.
  - **Description preview on card list** — show a 2-line description preview vs. an icon-only indicator.

**Image placeholders**:
- `![Board card settings panel](images/board-settings-card.png)`

---

### 40. `board-settings-list.md` — Board Settings: List Settings

**Nav order**: 40  
**Parent**: Board Settings

**Content**:
- **Board Settings → Board Settings tab → List Settings** sub-panel.
- Configurable list options:
  - **Default column width** — pixel value, range 140–800 px.
  - **Max cards per list** — WIP limit, range 1–100,000 cards.
  - **Hard vs. Soft limit** toggle — hard limit blocks adding cards at the limit; soft limit shows a warning only.

**Image placeholders**:
- `![Board list settings panel](images/board-settings-list.png)`

---

### 41. `board-settings-labels.md` — Board Settings: Labels

**Nav order**: 41  
**Parent**: Board Settings

**Content**:
- **Board Settings → Board Settings tab → Labels** sub-panel.
- Board-scoped label management (labels are per-board, not shared across boards):
  - View all labels for this board — name and colour swatch.
  - **Create** a new label: name + colour picker from a preset palette.
  - **Edit** label: change name or colour.
  - **Delete** label: removes from all cards on the board (confirmation required).
- Labels update in real-time via Socket.io.

**Image placeholders**:
- `![Board labels management](images/board-labels.png)`
- `![Label colour picker](images/board-label-colours.png)`

---

### 42. `board-settings-users.md` — Board Settings: Users & Permissions

**Nav order**: 42  
**Parent**: Board Settings

**Content**:
- **Board Settings → Users & Permissions** tab.
- Two-panel layout:
  - **Left panel — "All Users" (directory)**: searchable user directory (enter-to-commit search), paginated and virtualised. Select a role before adding. "Add" button per user. "Discard all placeholder users" button (for import placeholders).
  - **Right panel — "Current Members"**: searchable, filterable by role. Columns: name, avatar, role selector (dropdown to change), remove button.
- **Board owner** row — displayed with a non-editable "Owner" role.
- **Import placeholder badges**: "Imported" / "Not Mapped" badges for users from board imports.
- **Available roles**: Admin, Manager, Viewer (built-in) + any custom roles. Role assignment respects the hierarchy mode configured in the global Permissions & Roles settings.

**Image placeholders**:
- `![Board members panel](images/board-members.png)`

---

### 43. `board-settings-invites.md` — Board Settings: Invites & Sharing

**Nav order**: 43  
**Parent**: Board Settings

**Content**:
- **Invites modal** — accessible from the invites button on the board navbar (gated by `invites.view` permission).
- **Copy board page link** — quick share of the board URL.
- **Create invite link** (gated by `invites.create`):
  - Invite type: one-time (single use) or recurring (reusable).
  - Assign a default role for the invitee.
- **View active invite links** — table with link, type, role, created date.
- **Delete invite link** (gated by `invites.delete`).
- Real-time invite updates via Socket.io.

**Image placeholders**:
- `![Board invites modal](images/board-invites.png)`

---

### 44. `board-settings-theme.md` — Board Settings: Theme & Colouring

**Nav order**: 44  
**Parent**: Board Settings

**Content**:
- **Board Settings → Theme & Background tab → Theme & Colouring** sub-panel.
- **Theme catalog**: grid of theme cards. Each card shows the theme name and a colour-swatch preview.
- **System themes** (8 built-in):
  - Ocean Blue (default), Sunset Orange, Forest Green, Ruby Red, Royal Purple, Hot Pink, Mint Green, Teal.
- **Custom themes**: user-created themes appear alongside system themes.
- **Actions per theme card**:
  - Select (applies to this board).
  - Edit (opens the theme editor — custom themes only).
  - Duplicate (creates a copy for editing).
  - Delete (custom themes only, confirmation modal).
- **"Add custom theme"** button — opens the theme editor with a blank palette.
- **Intelligent Contrast** toggle — automatically adjusts text colours for WCAG 4.5:1 contrast ratio against their backgrounds.
- Link to the dedicated [Themes](themes.md) page for full documentation.

**Image placeholders**:
- `![Board theme selector](images/board-theme-selector.png)`

---

### 45. `board-settings-background.md` — Board Settings: Background

**Nav order**: 45  
**Parent**: Board Settings

**Content**:
- **Board Settings → Theme & Background tab → Background** sub-panel.
- **Background mode** selector:
  - **Theme** — uses the canvas background colour from the active theme.
  - **Colour** — custom solid colour picker.
  - **Image** — upload a custom background image.
- **Image options** (when image mode selected):
  - Upload image (with smart focal-point detection via `smartcrop`).
  - Image scale mode: Fill, Fit, Fit Top-Left, Smart Fill.
  - Delete background image.
- **Board opacity** slider (0.1–1.0) — controls transparency of the navbar and lists when rendered over an image background.

**Image placeholders**:
- `![Board background settings](images/board-background.png)`
- `![Custom background upload](images/board-background-upload.png)`

---

### 46. `board-settings-audit.md` — Board Settings: Audit Log

**Nav order**: 46  
**Parent**: Board Settings

**Content**:
- **Board Settings → Audit Log** tab.
- Tracks board member activity events:
  - `board.member.add` — a member was added.
  - `board.member.remove` — a member was removed.
  - `board.member.role.update` — a member's role was changed.
- Each entry shows: actor name, target user, action, role badge(s), timestamp.
- Detects invite-based joins vs. direct admin adds.
- **Paginated by day** — forward/backward navigation arrows.
- **Configurable retention**: Never, 10 days, 30 days, 90 days, 1 year.
- Virtualised list rendering for performance (`react-virtuoso`).

**Image placeholders**:
- `![Board audit log](images/board-audit-log.png)`

---

### 47. `themes.md` — Themes

**Nav order**: 47  
**Parent**: _(root)_

**Content**:
- Overview of the theming system: each board can have its own independent theme.
- **How themes work**: themes define a palette of CSS custom properties (variables) applied to board elements. The palette has 20 named colour slots organised into sections.
- **Default themes** — 8 built-in themes shipped with Atlantisboard:
  1. **Ocean Blue** (default) — calm blue tones.
  2. **Sunset Orange** — warm orange/amber palette.
  3. **Forest Green** — natural green tones.
  4. **Ruby Red** — bold red palette.
  5. **Royal Purple** — rich purple tones.
  6. **Hot Pink** — vibrant pink palette.
  7. **Mint Green** — fresh mint/seafoam tones.
  8. **Teal** — cool teal palette.
- Each theme with a colour swatch strip and a screenshot of a board using that theme.

**Image placeholders**:
- `![Default themes gallery](images/themes-default-gallery.png)`
- `![Ocean Blue theme example](images/theme-ocean-blue.png)`
- `![Sunset Orange theme example](images/theme-sunset-orange.png)`

---

### 48. `theme-editor.md` — Custom Theme Editor

**Nav order**: 48  
**Parent**: Themes

**Content**:
- Accessing the custom theme editor: Board Settings → Theme tab → "Add custom theme" or edit an existing custom theme.
- **Theme name** — text input.
- **Colour editing** — colour inputs (with swatches) for all palette slots, grouped into 4 sections:
  - **Navbar**: navbar background, navbar border/icon colour.
  - **Lists / Columns**: list background, list header text, list muted text (two shades), list control hover background, list shadow, add-list button background + hover.
  - **Card Detail Window**: card detail background, title text, body text, button background + text + hover background + hover text.
  - **Scrollbars**: scrollbar thumb colour.
- **Intelligent Contrast** toggle — auto-adjusts text colours for accessibility.
- **Live preview panel** — miniature board preview showing a navbar, list columns, and a card detail mockup with the current palette applied.
- **Saving** a custom theme.
- **Editing** an existing custom theme.
- **Deleting** a custom theme (confirmation modal).

**Image placeholders**:
- `![Custom theme editor](images/theme-editor.png)`
- `![Theme colour pickers by section](images/theme-editor-colours.png)`
- `![Theme live preview panel](images/theme-editor-preview.png)`

---

### 49. `theme-sharing.md` — Sharing & Managing Themes

**Nav order**: 49  
**Parent**: Themes

**Content**:
- Custom themes are scoped per user — each user can create their own themes.
- Users with the `boards.themes.customtheme` permission can create/edit/delete custom themes.
- Users with the `boards.themes.changetheme` permission can apply any theme (system or custom) to boards they manage.
- Applying a theme to a board: select it in the theme catalog.
- Removing a custom theme from a board: select a different theme or revert to the default (Ocean Blue).
- Duplicating a system theme: creates an editable copy for customisation.

---

### 50. `import.md` — Importing Boards

**Nav order**: 50  
**Parent**: Import & Export

**Content**:
- **Supported import formats** (4):
  - **Atlantisboard JSON** — native format, full fidelity.
  - **Trello® JSON** — Trello® board export file.
  - **WeKan® JSON** — WeKan® board export file.
  - **CSV / TSV** — tabular card data appended to an existing board.
- **Import flow**:
  1. Open the Import/Export modal from the home page.
  2. Select the import source/format.
  3. Upload a file (max size configurable via `BOARD_IMPORT_MAX_MB`, default 35 MB).
  4. **Preflight** (Trello®/WeKan®): the file is parsed client-side to detect users and (for Wekan) legacy inline buttons with broken icon URLs.
  5. **User Management tab**: choose whether to create placeholder users or discard unmapped users.
  6. **Replace Buttons tab** (WeKan® only): upload replacement icons for legacy inline buttons.
  7. Optionally set a default card colour.
  8. Confirm and start the import.
- **Import job tracking**: server creates a persistent `ImportJob` record. The client polls progress every 2 seconds, showing a progress bar with current phase (boards → labels → lists → cards → done).
- **What gets imported** (format-dependent): boards, lists, cards, labels, checklists, comments.
- **Placeholder users**: imported users are tracked per board. When a real user signs in with a matching email, they are automatically claimed as a board member.
- **Error handling**: partial import results displayed; errors logged.
- **Permissions**: import is gated by format-specific permissions (`import.trello`, `import.wekan`) and the user's `Import Boards` capability flag.

**Image placeholders**:
- `![Import modal](images/import-modal.png)`
- `![Import user management tab](images/import-user-management.png)`
- `![Import progress](images/import-progress.png)`

---

### 51. `export.md` — Exporting Boards

**Nav order**: 51  
**Parent**: Import & Export

**Content**:
- **Export formats** (4, each gated by a role permission):
  - **CSV** (`export.board.csv`) — card data in tabular format with configurable columns (title, description, list, labels, assignees, due date, start date, completed, created, updated).
  - **Trello® JSON** (`export.board.trello`) — Trello-compatible JSON.
  - **WeKan® JSON** (`export.board.wekan`) — Wekan-compatible JSON.
  - **Atlantisboard JSON** (`export.board.atlantisboard`) — complete board data with embedded attachments (up to 25 MB as data URLs).
- **Export flow**:
  1. Open the board card context menu on the home page, or use the Export tab in the Import/Export modal.
  2. Select the export format.
  3. For CSV: optionally select which columns to include.
  4. Download the file (served with `Content-Disposition: attachment`).

**Image placeholders**:
- `![Export options](images/export-options.png)`

---

### 52. `offline-pwa.md` — Offline & PWA

**Nav order**: 52  
**Parent**: _(root)_

**Content**:
- **Install as app**: Atlantisboard can be installed as a Progressive Web App (PWA).
  - Desktop: install prompt in the browser address bar.
  - Mobile: "Add to Home Screen".
  - PWA detection adjusts the UI layout (fullscreen modal handling, header spacing).
- **What works offline**:
  - Viewing cached boards and cards (Dexie.js / IndexedDB).
  - Queued changes synced when back online.
- **What requires a connection**: real-time updates, file uploads, authentication, initial data load.
- **Offline persistence notice**: in-app notification about offline state.
- Service worker behaviour.

**Image placeholders**:
- `![PWA install prompt](images/pwa-install.png)`
- `![Offline indicator](images/offline-indicator.png)`

---

### 53. `keyboard-shortcuts.md` — Keyboard Shortcuts & Tips

**Nav order**: 53  
**Parent**: _(root)_

**Content**:
- Standard browser/form keyboard interactions.
- Mobile gesture tips:
  - Long-press to initiate drag (cards, lists, workspace rows, board tiles).
  - Swipe down to close card detail modal.
- Accessibility notes: ARIA labels on all interactive elements, screen reader support.
- Navigation tips: use the browser's back button or the back arrow in the navbar to return to the home page.

---

## Image Placeholders Summary

All image placeholders referenced above should be placed in `docs/wiki/images/`. Complete list:

```
images/
├── getting-started-overview.png
├── docker-compose-architecture.png
├── reverse-proxy-diagram.png
├── first-admin-register.png
├── admin-login-options.png
├── admin-google-oauth.png
├── admin-registration-mode.png
├── admin-permissions.png
├── admin-permissions-custom-role.png
├── admin-users.png
├── admin-user-actions.png
├── admin-email-smtp.png
├── admin-email-provider.png
├── admin-database.png
├── admin-database-cleanup.png
├── admin-backup.png
├── admin-backup-history.png
├── admin-backup-restore.png
├── admin-monitor.png
├── admin-monitor-charts.png
├── admin-login-branding.png
├── admin-login-logo-upload.png
├── admin-login-branding-preview.png
├── admin-app-branding.png
├── admin-app-branding-navbar.png
├── admin-email-branding.png
├── admin-email-branding-preview.png
├── admin-custom-fonts.png
├── admin-fonts-catalog.png
├── auth-login.png
├── auth-register.png
├── auth-forgot-password.png
├── auth-reset-password.png
├── auth-google.png
├── user-menu.png
├── user-profile.png
├── user-change-password.png
├── user-notifications.png
├── home-page.png
├── home-board-tiles.png
├── workspaces.png
├── workspace-context-menu.png
├── create-board.png
├── board-card-menu.png
├── board-overview.png
├── board-navbar.png
├── lists.png
├── list-actions.png
├── card-preview.png
├── card-badges.png
├── card-detail.png
├── card-description.png
├── card-checklist.png
├── card-comments.png
├── card-attachments.png
├── card-reminders.png
├── drag-and-drop.png
├── board-filter.png
├── board-settings-card.png
├── board-settings-list.png
├── board-labels.png
├── board-label-colours.png
├── board-members.png
├── board-invites.png
├── board-theme-selector.png
├── board-background.png
├── board-background-upload.png
├── board-audit-log.png
├── themes-default-gallery.png
├── theme-ocean-blue.png
├── theme-sunset-orange.png
├── theme-editor.png
├── theme-editor-colours.png
├── theme-editor-preview.png
├── import-modal.png
├── import-user-management.png
├── import-progress.png
├── export-options.png
├── pwa-install.png
└── offline-indicator.png
```

---

## Jekyll Front Matter Template

Every wiki page should use this YAML front matter:

```yaml
---
layout: wiki
title: "Page Title"
description: "Brief one-line description for search and SEO."
parent: "Parent Page Title"    # omit for root-level pages
nav_order: 1                   # controls sidebar ordering
permalink: /wiki/page-slug/
---
```

---

## Notes for the GitHub Automation Job

1. **Source**: all wiki pages live in `docs/wiki/*.md` as flat files.
2. **Conversion**: the automation job should:
   - Read each `.md` file.
   - Preserve YAML front matter (or inject it from this spec if not yet present).
   - Convert relative Markdown links (`[text](other-page.md)`) to Jekyll permalink links (`[text](/wiki/other-page/)`).
   - Convert image paths (`images/foo.png`) to the Jekyll asset path (e.g. `/assets/wiki/foo.png`).
   - Generate a searchable index (Lunr.js, Pagefind, or Jekyll's built-in search).
3. **Sidebar navigation**: generate from `nav_order` and `parent` fields in front matter. Supports two-level nesting (top-level sections and child pages).
4. **Styling**: inherit the main Jekyll site theme. The wiki replaces the current "Wiki" hyperlink with the full wiki section.
5. **Images**: copy `docs/wiki/images/` to the Jekyll `assets/wiki/` directory.
6. **Current wiki pages**: the existing `docs/wiki/*.md` files will be removed and replaced with the new structure defined here.
