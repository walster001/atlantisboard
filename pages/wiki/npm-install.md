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

The same Whiptail installer is also in the **GitHub Release** file `atlantisboard-<version>.zip` (see [GitHub Release install](#github-release-install) below).

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

## GitHub Release install

Download **`atlantisboard-<version>.zip`** from [GitHub Releases](https://github.com/walster001/atlantisboard/releases) (not the `-runtime.zip` file). That archive is the same layout as the npm package, including the Whiptail wizard.

```bash
unzip atlantisboard-1.0.1.zip -d atlantisboard-1.0.1
cd atlantisboard-1.0.1
sudo ./atlantisboard-setup
```

Requires Linux, **whiptail**, **jq**, **openssl**, and **Docker** (for full-stack or dependency modes). Secrets are auto-generated; choose **Docker full stack** for the easiest single-server setup.

> **Note:** `atlantisboard-<version>-runtime.zip` is a **slim runtime-only** bundle without the installer — use it only if you configure `.env` and services yourself. See [DEPLOYMENT.md](https://github.com/walster001/atlantisboard/blob/main/DEPLOYMENT.md).

## What the wizard does

1. **Installation type** — choose one of three paths:
   - **Docker full stack** (recommended) — builds and runs the app, MongoDB, Redis, and MinIO entirely in Docker.
   - **Docker dependencies only** — MongoDB, Redis, and MinIO in Docker; app runs on the host with Bun.
   - **Manual** — connect to your existing MongoDB, Redis, and MinIO servers.
2. **Install directory** — default `/opt/atlantisboard` (copies built app files from the package).
3. **Environment** — friendly prompts with validation; security secrets are **generated automatically** (no need to press Enter on each password field).
4. **Dependencies** — `bun install --production` on the host (skipped for full-stack Docker mode).
5. **systemd** — optional `atlantisboard` and `atlantisboard-worker` units for host-run modes.
6. **Reverse proxy (optional)** — at the end of the wizard, choose **Nginx** or **Caddy**. You get validated prompts for domain, backend host/port, upload limits, and TLS paths (Nginx) or log path (Caddy). The installer can install the package on Debian/Ubuntu via `apt`, write the site config, update `APP_URL` / `CORS_ORIGIN` / `TRUST_PROXY_HOPS` in `.env`, and optionally run `certbot --nginx`.

## After install

- App URL: value of `APP_URL` in `.env` (default `http://localhost:3000`).
- Health check: `curl -s http://localhost:3000/health`
- Logs: `journalctl -u atlantisboard -f`

## Related docs

- [Environment variables](/wiki/environment-variables/)
- [Manual installation](/wiki/manual-install/)
- [Docker Compose install](/wiki/docker-compose-install/)
- [Updating & maintenance](/wiki/updating/)
