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
| **RAM** | 2 GB |
| **Disk** | 10 GB free (SSD recommended) |

### Larger Deployment (10–50+ users)

| Resource | Recommended |
|----------|-------------|
| **CPU** | 2–4 vCPUs / cores |
| **RAM** | 4–8 GB |
| **Disk** | 20–50 GB SSD (scales with attachment storage) |

> **Note:** Disk usage depends heavily on how many file attachments, board backgrounds, and backups you store. MinIO handles object storage separately, so plan accordingly if your team uploads large files frequently.

---

## Software

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

- [Docker Compose Installation (Recommended)](docker-compose-install.md) — the fastest way to get up and running.
- [Manual Installation](manual-install.md) — for environments where Docker is not available.
