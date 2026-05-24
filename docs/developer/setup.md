# Developer setup and operations

This guide is for **developers and operators** who clone the repository, run it locally, or deploy it. End-user help lives in the [user wiki](../wiki/Home.md).

---

## What this project is

Self-hosted Kanban-style boards with workspaces, real-time collaboration, rich cards (labels, checklists, comments, attachments, dates), RBAC, invites, import/export, admin tooling, and PWA-oriented behaviour.

---

## Technology stack (from `package.json`)

**Runtime and tooling**

- Bun (see `engines` in `package.json`)

**Backend**

- Express 5.x  
- TypeScript  
- MongoDB / Mongoose  
- Socket.io  
- Passport (including Google OAuth strategy)  
- Redis (sessions and related use)  
- MinIO SDK (S3-compatible object storage)  
- Helmet, CORS, express-session, rate limiting, multer, zod, pino, and others as declared in `package.json`

**Frontend**

- React and React DOM  
- React Router  
- TypeScript  
- Mantine (core, dates, hooks, modals, notifications, dropzone, charts)  
- Tailwind CSS  
- Dexie (IndexedDB)  
- Pragmatic drag-and-drop (`@atlaskit/pragmatic-drag-and-drop`)  
- Tiptap, zustand, axios, Virtuoso, dayjs, Socket.io client, and others per `package.json`

---

## Prerequisites

- Bun v1.3.5 or higher ([Bun installation](https://bun.sh/docs/installation))  
- Docker and Docker Compose (for local MongoDB, Redis, MinIO)  
- Or self-managed MongoDB, Redis, and S3-compatible storage aligned with `.env.example`

---

## Quick start (development)

Recommended one-shot script from the repository root:

```bash
./scripts/dev-deploy.sh
```

This typically checks prerequisites, ensures `.env` exists, starts Docker services, installs dependencies, typechecks, and starts dev with hot reload. The app is usually at `http://localhost:3000`.

Alternative:

```bash
./scripts/dev-start.sh
```

Or manually: copy `.env.example` to `.env`, run `docker compose up -d`, then `bun install` and `bun run dev`.

---

## WSL2 / LAN access

To reach the dev server from another device when the app runs in WSL2:

1. Set `HOST=0.0.0.0` in `.env` if you need all interfaces.  
2. On Windows, create a portproxy from a Windows port to the WSL IP and app port (PowerShell as Administrator). Example pattern:

```powershell
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=36521 connectaddress=<WSL_IP> connectport=3000
New-NetFirewallRule -DisplayName "Kanboard WSL LAN 36521" -Direction Inbound -Protocol TCP -LocalPort 36521 -Action Allow
```

3. Open `http://<WINDOWS_LAN_IP>:36521` from the other device.

Use `hostname -I` in WSL for the WSL IP and `ipconfig` on Windows for the LAN IP. Set `CORS_ORIGIN` in `.env` to a comma-separated list if you use multiple browser origins.

Helper script (prints suggested commands):

```bash
./scripts/print-wsl-lan-portproxy.sh
```

---

## Manual setup (clone)

```bash
git clone <repository-url>
cd atlboard-new
cp .env.example .env
# edit .env
docker compose up -d
bun install
bun run dev
```

The dev script builds the client as needed and watches for changes.

---

## Environment variables

Maintain a local `.env` based on **`.env.example`** in the repository root. That file is the source of truth for variable names and comments. At minimum for local dev you will set or accept defaults for server host/port, MongoDB URI, Redis, MinIO, JWT/session-related secrets, optional Google OAuth keys, and `CORS_ORIGIN`.

**Production:** set strong random values for all secrets (`openssl rand -base64 48`), set `NODE_ENV=production`, and use real connection strings. Required secrets: `JWT_SECRET`, `SESSION_SECRET`, `CSRF_SECRET`, and `ENCRYPTION_KEY` (each at least 32 characters). The server refuses to start in production with placeholder or short secrets.

Set explicit `CORS_ORIGIN` (no `*` wildcard) matching your SPA origin, e.g. `https://app.atlantis.social`. Set `TRUST_PROXY_HOPS=1` when running behind nginx or Caddy. See `deploy/nginx/kanboard.conf` for a production reverse-proxy template.

**Production Docker:** `docker-compose.prod.yml` keeps MongoDB, Redis, and MinIO on the internal Docker network only (no host ports). Only the `app` service is published. Branding assets are served through app proxy routes (`/api/v1/branding/*`), not a public MinIO bucket policy. Set non-default `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, and `REDIS_PASSWORD` before `./scripts/prod-deploy.sh`.

**Build-time client URLs:** set `API_BASE_URL` / `SOCKET_URL` (or equivalent build env) to your production app origin so the SPA and Socket.io client connect to the same host as `CORS_ORIGIN`.

**OAuth staging checklist:** register `https://app.atlantis.social/api/v1/auth/google/callback` (and matching `GOOGLE_OAUTH_BROWSER_ORIGIN`) in Google Cloud before go-live.

The production deploy script validates that default secrets and infrastructure credentials are not left in place.

---

## npm scripts (from `package.json`)

| Script | Purpose |
|--------|--------|
| `bun run dev` | Dev orchestration (`scripts/dev.ts`) |
| `bun run dev:server` | Watch server entry |
| `bun run dev:client` | Watch client entry |
| `bun run dev:worker` | Watch worker entry |
| `bun run build` | Production build to `dist/` |
| `bun run start` | Run built server (`dist/server`) |
| `bun run start:worker` | Run built worker (`dist/workers`) |
| `bun run typecheck` | TypeScript check |
| `bun test` | Tests |
| `bun run lint` | ESLint (requires project ESLint config) |

---

## Deployment scripts (`scripts/`)

| Script | Role |
|--------|------|
| `dev-deploy.sh` | One-click dev setup |
| `dev-start.sh` | Dev start helper |
| `prod-deploy.sh` | Production compose + build checks |
| `check-prerequisites.sh` | Bun, Docker, ports, disk |
| `setup-env.sh` | Seed `.env` from template |
| `wait-for-services.sh` | Wait for containers |
| `health-check.sh` | HTTP health probe |
| `release-bundle.sh` | Release artifact (see `package.json` `release:bundle`) |

Examples:

```bash
./scripts/prod-deploy.sh
./scripts/health-check.sh http://localhost:3000
./scripts/check-prerequisites.sh
```

---

## Production deployment

**Docker (recommended path in repo):**

```bash
./scripts/prod-deploy.sh
```

The script validates secrets (`JWT_SECRET`, `SESSION_SECRET`, `CSRF_SECRET`, `ENCRYPTION_KEY`), non-default MinIO/Redis credentials, and explicit `CORS_ORIGIN` before starting containers.

Or manually:

```bash
docker build -t kanboard:latest .
docker compose -f docker-compose.prod.yml up -d
```

**Reverse proxy:** terminate TLS on the host with nginx (see `deploy/nginx/kanboard.conf`) or Caddy. Forward `/`, `/api/`, `/health`, and `/socket.io/` to the app container. Do not expose MongoDB, Redis, or MinIO to the public internet.

**Recommended production env (example):**

```bash
NODE_ENV=production
APP_URL=https://app.atlantis.social
CORS_ORIGIN=https://app.atlantis.social
TRUST_PROXY_HOPS=1
GOOGLE_OAUTH_BROWSER_ORIGIN=https://app.atlantis.social
```

**Bare metal:**

```bash
bun run build
bun run start
```

Run `bun run start:worker` as a separate process unless your environment sets the variable that allows scheduled jobs in the main server process (see server docs / `index.ts` comments).

---

## Background jobs

Workers may perform activity cleanup, import job cleanup, notification cleanup, orphaned attachment cleanup, and reminder checks on intervals defined in code. Ensure the worker process runs in production if the main process does not host cron.

---

## Project layout (simplified)

```
src/
  server/     # Express app, routes, services, models, sockets, workers entry
  client/     # React app, pages, components, hooks, store
  shared/     # Shared types and helpers
public/       # Static assets served by the shell
scripts/      # Shell helpers for deploy and utilities
tests/
docker-compose.yml
docker-compose.prod.yml
Dockerfile
.env.example
package.json
```

Server HTTP handlers live under `src/server/routes/` (not a separate `controllers/` tree).

---

## HTTP API (developer reference)

Versioned JSON API is mounted at **`/api/v1/`**. A simple **`/health`** check may exist at the root for probes.

### Authentication (representative)

- `POST /api/v1/auth/register` — register  
- `POST /api/v1/auth/login` — login  
- `POST /api/v1/auth/logout` — logout  
- `GET /api/v1/auth/me` — current user  
- `GET /api/v1/auth/google` — start Google OAuth  
- `GET /api/v1/auth/google/callback` — OAuth callback  

Additional auth and CSRF routes exist in `src/server/routes/` — treat that tree as canonical.

### Workspaces (representative)

- `GET /api/v1/workspaces` — list  
- `POST /api/v1/workspaces` — create  
- `GET /api/v1/workspaces/:id` — get  
- `PUT /api/v1/workspaces/:id` — update  
- `DELETE /api/v1/workspaces/:id` — delete  

### Boards (representative)

- `GET /api/v1/boards` — list  
- `POST /api/v1/boards` — create  
- `GET /api/v1/boards/:id` — get  
- `PUT /api/v1/boards/:id` — update  
- `DELETE /api/v1/boards/:id` — delete  

### Import / export (representative)

- `POST /api/v1/import/trello` — Trello JSON import  
- `GET /api/v1/import/jobs/:jobId` — import job status  
- `GET /api/v1/export/boards/:id/json` — JSON export  
- `GET /api/v1/export/boards/:id/csv` — CSV export  

Full routing is composed in `src/server/routes/index.ts` and nested modules under `src/server/routes/`.

---

## Security considerations

- Rotate all default secrets before production.  
- Keep secrets in environment variables or a secrets manager.  
- Terminate TLS at a reverse proxy; forward only trusted `X-Forwarded-*` headers.  
- Configure `CORS_ORIGIN` explicitly for real browser origins.  
- Firewall internal database, Redis, and MinIO ports.  
- Run `bun audit` when changing dependencies.  
- Report vulnerabilities responsibly (see root `README.md` security note).

---

## Contributing

1. Fork the repository  
2. Create a feature branch  
3. Commit and push  
4. Open a pull request  

Use `bun run typecheck` and `bun test` before submitting.

---

## License

See `package.json` (`license` field) and repository licensing files.

---

## Further reading

- [Technical specifications](../../specifications.md) — deeper architecture and requirements  
- [User wiki](../wiki/Home.md) — non-technical product help  
