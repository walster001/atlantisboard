---
layout: wiki
title: "npm install (atlantisboard)"
description: "Install Atlantisboard from npm with the interactive Whiptail setup wizard."
parent: "Deployment & Installation"
nav_order: 2
permalink: /wiki/npm-install/
---

# npm install (`atlantisboard`)

Install the published package on a **Linux** server with [Bun](https://bun.sh) and **whiptail** (dialog UI).

## Quick install

```bash
npm install -g atlantisboard
```

On an interactive terminal, postinstall may launch the setup wizard. Otherwise run:

```bash
atlantisboard-setup
# or
atlantisboard setup
```

Skip automatic setup (CI / scripts):

```bash
ATLANTISBOARD_SKIP_SETUP=1 npm install -g atlantisboard
atlantisboard-setup   # run later on the target host
```

## What the wizard does

1. **Install mode** — Docker Compose for MongoDB, Redis, and MinIO, or connect to existing services.
2. **Install directory** — default `/opt/atlantisboard` (copies built app files from the package).
3. **Environment** — prompts for each important variable (labels and descriptions); secrets can be auto-generated.
4. **Dependencies** — `bun install --production` in the install directory.
5. **systemd** — optional `atlantisboard` and `atlantisboard-worker` units (background cron/backup jobs use the worker unless `ENABLE_CRON_JOBS_IN_MAIN=true`).
6. **Reverse proxy (optional)** — at the end of the wizard, choose **Nginx** or **Caddy**. You get the same Whiptail prompts for domain, backend host/port, upload limits, and TLS paths (Nginx) or log path (Caddy). The installer can install the package on Debian/Ubuntu via `apt`, write the site config, update `APP_URL` / `CORS_ORIGIN` / `TRUST_PROXY_HOPS` in `.env`, and optionally run `certbot --nginx`.

## After install

- App URL: value of `APP_URL` in `.env` (default `http://localhost:3000`).
- Health check: `curl -s http://localhost:3000/health`
- Logs: `journalctl -u atlantisboard -f`

## Related docs

- [Environment variables](environment-variables.md)
- [Manual installation](manual-install.md)
- [Docker Compose install](docker-compose-install.md)
- [Updating & maintenance](updating.md)
