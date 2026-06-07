---
layout: wiki
title: "Debian installation (auto setup)"
description: "Install Atlantisboard on Debian with the atlantisboard-setup Whiptail wizard and Docker full stack."
parent: "Deployment & Installation"
nav_order: 3
permalink: /wiki/debian-install/
---

# Debian installation (auto setup)

This guide covers installing Atlantisboard on **Debian** (11 *bullseye* or 12 *bookworm*, **12 recommended**) using the interactive **`atlantisboard-setup`** wizard. The same installer works on Ubuntu; Debian is a first-class target for **Docker full stack** mode.

For npm details and wizard options shared with other distros, see [npm install (`atlantisboard`)](npm-install.md).

---

## Recommended path: Docker full stack

Choose **Docker full stack** in the wizard. The app, MongoDB, Redis, and MinIO all run in containers. You do **not** need Bun on the host for this mode.

Malware scanning uses **on-demand `clamscan` inside the app container** (no separate ClamAV sidecar). Signature files are stored in the `clamav-sigs-full` Docker volume.

---

## Before you start

| Requirement | Notes |
|-------------|--------|
| **Debian 12 (bookworm)** | Best tested; has `docker.io` and `docker-compose-v2` in main repos |
| **Debian 11 (bullseye)** | Supported; install Docker and Compose yourself if the wizard cannot |
| **Root or sudo** | Wizard uses `sudo` for package install, `/opt/atlantisboard`, and Docker |
| **Interactive TTY** | Whiptail needs a real terminal (SSH session, not a non-interactive CI job) |
| **Outbound HTTPS** | Pull container images and (on first scan) ClamAV signature updates |

**Hardware:** see [System Requirements](system-requirements.md) — **2 GB RAM** minimum for small teams; **4 GB+** comfortable for full stack on a single VM.

---

## Quick install (GitHub Release zip)

1. Download **`atlantisboard-<version>.zip`** from [GitHub Releases](https://github.com/walster001/atlantisboard/releases) (not `-runtime.zip`).

2. Extract and run the wizard:

```bash
unzip atlantisboard-*.zip -d atlantisboard
cd atlantisboard
sudo ./atlantisboard-setup
```

3. In the menu, select **Docker full stack — app, database, Redis, and storage (easiest)**.

4. Accept defaults or set `APP_URL` when prompted. Secrets (`MONGODB_*`, `REDIS_PASSWORD`, MinIO keys, JWT/session keys, etc.) are **generated automatically**.

5. When the wizard offers to **install missing prerequisites**, choose **Yes** so it can run `apt-get` for tools such as `whiptail`, `jq`, `openssl`, `rsync`, and optionally `docker.io` + `docker-compose-v2`.

6. Wait for the image build and `docker compose up` to finish (first run can take several minutes).

7. Open `APP_URL` from `/opt/atlantisboard/.env` (default `http://localhost:3000`) and create your first account — see [Creating the First Admin Account](first-admin-account.md).

### Alternative: npm global package

```bash
sudo npm install -g atlantisboard
sudo atlantisboard-setup
```

Same wizard; install files land under `/opt/atlantisboard` by default.

---

## What the wizard installs on Debian (via `apt`)

When you allow prerequisite installation, the installer uses **`apt-get`** (same code path as Ubuntu):

| Component | Debian packages (typical) |
|-----------|---------------------------|
| Dialog UI | `whiptail` |
| JSON / crypto / sync | `jq`, `openssl`, `rsync` |
| Docker Engine | `docker.io` |
| Compose v2 | `docker-compose-v2` |
| Port checks | `iproute2` (`ss`) or `netcat-openbsd` |

Optional **reverse proxy** step can install **Nginx**, **Caddy**, or **certbot** via `apt` and write site configs — see [Reverse Proxy Setup](reverse-proxy.md).

---

## Verify the installation

```bash
cd /opt/atlantisboard/install/docker
sudo docker compose --env-file image-defaults.env --env-file ../../.env \
  -f docker-compose.fullstack.yml ps
```

Expect **mongodb**, **redis**, **minio**, and **app** running (healthy). One-shot jobs **mongodb-init** and **minio-setup** should show **Exited (0)**.

Health check:

```bash
curl -s http://localhost:3000/health
```

View logs:

```bash
sudo docker logs atlantisboard-app-full --tail 50
sudo docker logs atlantisboard-mongodb-full --tail 50
```

---

## Debian-specific notes and troubleshooting

### Docker auto-install fallback

The wizard first tries **Debian/Ubuntu distro packages** (`docker.io`, `docker-compose-v2`). If those fail, it may attempt Docker’s **official apt repository**. That fallback is oriented toward **Ubuntu** URLs and can fail on pure Debian.

**If Docker installation fails:**

1. Install Docker using [Docker’s Debian instructions](https://docs.docker.com/engine/install/debian/).
2. Confirm: `docker --version` and `docker compose version`.
3. Re-run: `sudo ./atlantisboard-setup` (or continue from compose step if `.env` already exists).

Pre-installing Docker before the wizard is the most reliable approach on minimal Debian images.

### MongoDB unhealthy / `SCRAM authentication failed, storedKey mismatch`

MongoDB is running, but the **password in `.env` does not match** what is already stored in the **`mongo-data-full`** volume. This happens when you re-run setup and new secrets are generated while old Docker volumes still exist.

**Fix (destroys all board data):**

```bash
cd /opt/atlantisboard/install/docker
sudo bash reset-docker-data.sh fullstack
cd /opt/atlantisboard
sudo ./atlantisboard-setup
```

The wizard warns about **existing Docker data** when it detects old volumes; if you changed secrets, **reset volumes** instead of continuing.

### MongoDB image and kernel

The installer pins MongoDB to **`mongo:8.0.4`** in `install/docker/image-defaults.env`. Newer MongoDB 8.0.x tags can refuse to start on **Linux kernel 6.19+** (TCMalloc/RSEQ). Do not bump the Mongo image tag unless release notes say it is safe.

### Reinstall or upgrade from an older compose file

After upgrading the zip/npm package, remove orphaned containers from previous layouts:

```bash
cd /opt/atlantisboard/install/docker
sudo docker compose --env-file image-defaults.env --env-file ../../.env \
  -f docker-compose.fullstack.yml down --remove-orphans
```

Then run setup or `docker compose ... up -d --build` again.

### `.env` permissions

On some hosts `/opt/atlantisboard/.env` is root **`600`**. Use **`sudo`** for `docker compose` commands that pass `--env-file ../../.env`.

---

## Reinstall, reset, or update

| Goal | Action |
|------|--------|
| **Clean reinstall (wipe data)** | `install/docker/reset-docker-data.sh fullstack` then `atlantisboard-setup` |
| **Update app only** | New release zip → extract → `sudo ./atlantisboard-setup` or rebuild app container — see [Updating & Maintenance](updating.md) |
| **Uninstall** | `sudo ./atlantisboard-uninstall` from the install tree |

---

## Related docs

- [npm install (`atlantisboard`)](npm-install.md) — wizard modes and npm/GitHub zip overview
- [Docker Compose Installation](docker-compose-install.md) — manual compose from **git clone** (developers / custom builds)
- [Environment Variables Reference](environment-variables.md)
- [Reverse Proxy Setup](reverse-proxy.md)
- [System Requirements](system-requirements.md)
