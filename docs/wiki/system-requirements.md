---
layout: wiki
title: "System Requirements"
description: "Hardware, software, network, and browser requirements for running Atlantisboard."
parent: "Getting Started"
nav_order: 3
permalink: /wiki/system-requirements/
---

# System Requirements

This page lists everything you need to run Atlantisboard. There are two deployment paths — **Docker Compose** (recommended) and **manual installation** — and the requirements differ slightly between them.

---

## Hardware

### Small Team (1–10 users)

| Resource | Minimum |
|----------|---------|
| **CPU** | 1 vCPU / core |
| **RAM** | 2 GB (malware scanning uses on-demand `clamscan`; no `clamd` daemon) |
| **Disk** | 10 GB free (SSD recommended) |

### Larger Deployment (10–50+ users)

| Resource | Recommended |
|----------|-------------|
| **CPU** | 2–4 vCPUs / cores (see video note below) |
| **RAM** | 4–8 GB |
| **Disk** | 20–50 GB SSD (scales with attachment storage) |

### Video attachments (card uploads)

Video files in card descriptions and attachments use **progressive streaming** on every deployment: the browser plays the uploaded file directly with **HTTP range requests** (seek/scrub works on mobile and desktop). No extra setup is required.

**Adaptive bitrate (ABR)** — optional HLS/DASH renditions and the in-player **quality selector** — runs only when the server reports **4 or more vCPUs** (`os.cpus().length`). Below that threshold:

- Videos still upload, scan, and play from the original file.
- No ffmpeg ABR packaging on upload (avoids CPU starvation on small VMs).
- The quality gear is hidden in the UI.

| Host profile | Video playback | ABR / quality selector |
|--------------|----------------|-------------------------|
| **1–2 vCPU**, 2 GB RAM | Progressive stream of original file | Off |
| **2 vCPU**, 4 GB RAM + `clamd` | Progressive stream | Off |
| **≥ 4 vCPU**, 4 GB+ RAM | Progressive stream; ABR packaging when eligible | On (1080/720/480/360 ladder when source allows) |

> **Sizing tip:** Staging or small VMs (2 vCPU) are fine for boards and occasional video clips. If teams upload video regularly or you want manual quality selection, plan **≥ 4 vCPUs** and enough RAM for the full stack plus malware scanning (~4 GB+ total). Override with `VIDEO_ABR_ENABLED=true` or `VIDEO_ABR_MIN_VCPU` — see [Environment Variables — Video streaming](environment-variables.md#video-streaming).

> **Malware scanning and RAM:** Docker production images include ClamAV for attachment scanning. When **available memory is at least 2 GB** (`MemAvailable`, configurable via `POMPELMI_CLAMD_MIN_RAM_MB`), the app container starts **`clamd`** and keeps virus signatures in daemon RAM (~200–400 MB on top of the normal stack). Below that threshold it uses **`clamscan`** per upload instead — lower RAM, no extra daemon. **Allocating more than 2 GB of available RAM therefore increases memory use** for scanning. For a single VM running the full Docker stack with `clamd`, plan **4 GB+ total RAM**. See [Environment Variables — Malware scanning](environment-variables.md#malware-scanning-clamav--pompelmi).

> **Note:** Disk usage depends heavily on how many file attachments, board backgrounds, and backups you store. MinIO handles object storage separately, so plan accordingly if your team uploads large files frequently.

---

## Software

### Supported operating systems

| OS | Auto setup (`atlantisboard-setup`) | Notes |
|----|-----------------------------------|--------|
| **Debian 12 (bookworm)** | Recommended | Full-stack Docker; wizard installs deps via `apt`. See [Debian installation](debian-install.md). |
| **Debian 11 (bullseye)** | Supported | Pre-install Docker/Compose if wizard package step fails. |
| **Ubuntu 22.04 / 24.04** | Recommended | Same installer as Debian (`apt`). |
| **Other Linux** | Partial | Fedora/RHEL use `dnf` for some packages; full-stack Docker still works if Docker is pre-installed. |

The Whiptail installer requires **Linux**, **sudo**, and an **interactive terminal**. It is not supported on macOS or Windows natively (use Docker Desktop or WSL2 for development only).

### Docker Path (Recommended)

| Software | Minimum Version |
|----------|----------------|
| **Docker Engine** | 20.10+ |
| **Docker Compose** | v2.0+ (the `docker compose` plugin) |
| **Git** | Any recent version (to clone the repository) |

Docker Compose manages all other dependencies (MongoDB, Redis, MinIO, and the application itself) as containers. You do not need to install them separately.

### Manual Path

If you choose not to use Docker, you must install and manage each service yourself:

| Software | Minimum Version | Notes |
|----------|----------------|-------|
| **Bun** | 1.3.5+ | JavaScript runtime used to run the application |
| **MongoDB** | 8.x | Must be configured as a **replica set** (required for Change Streams) |
| **Redis** | 7.x | Used for session storage and rate-limit counters |
| **MinIO** | Latest stable | S3-compatible object storage for files and backups |
| **Git** | Any recent version | To clone the repository |

> **Important:** MongoDB must run as a replica set even for single-node deployments. Change Streams — which power real-time collaboration — require a replica set. See the [Manual Installation](manual-install.md) guide for replica set initialisation commands.

---

## Network Requirements

### Inbound

| Port | Purpose |
|------|---------|
| **3000** (default) | The Atlantisboard application HTTP port. Change with the `PORT` environment variable. |
| **80 / 443** | If using a reverse proxy (Nginx, Caddy) for TLS termination |

### Outbound

| Destination | Purpose |
|-------------|---------|
| **Google OAuth endpoints** | Required only if Google sign-in is enabled |
| **SMTP server** | Required for sending password reset, email verification, and invitation emails |
| **Docker Hub / container registries** | For pulling Docker images during setup and updates |

> **Tip:** If your server is behind a firewall, ensure outbound HTTPS (port 443) is allowed for OAuth and SMTP. Inbound access is only needed on the port you choose to expose (typically 80/443 behind a reverse proxy).

---

## Browser Support

Atlantisboard supports all modern evergreen browsers:

| Browser | Minimum Version |
|---------|----------------|
| **Google Chrome** | Latest 2 major versions |
| **Mozilla Firefox** | Latest 2 major versions |
| **Microsoft Edge** | Latest 2 major versions (Chromium-based) |
| **Safari** | Latest 2 major versions |
| **Mobile Chrome (Android)** | Latest version |
| **Mobile Safari (iOS)** | Latest version |

Atlantisboard is also installable as a **Progressive Web App (PWA)** on both desktop and mobile browsers.

> **Note:** Internet Explorer is not supported. Older browser versions may work but are not tested.

---

## Next Steps

- [Debian installation (auto setup)](debian-install.md) — GitHub zip or npm + `atlantisboard-setup` on Debian.
- [npm install (`atlantisboard`)](npm-install.md) — Whiptail wizard on any supported Linux distro.
- [Docker Compose Installation (Recommended)](docker-compose-install.md) — the fastest way to get up and running from a git clone.
- [Manual Installation](manual-install.md) — for environments where Docker is not available.
