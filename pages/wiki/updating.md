---
layout: wiki
title: "Updating & Maintenance"
description: "How to update Atlantisboard to the latest version and roll back if needed."
parent: "Deployment & Installation"
nav_order: 8
permalink: /wiki/updating/
---

# Updating & Maintenance

Keeping Atlantisboard up to date ensures you have the latest features, performance improvements, and security patches. This page covers update procedures for both Docker and manual installations, along with rollback instructions.

---

## Before You Update

Always follow this pre-update checklist:

- [ ] **Create a backup** — go to Admin → Backup & Restore and create a manual backup. This captures your database and all MinIO storage. See [Backup & Restore](#) for details.
- [ ] **Check the release notes** — review the changelog or release notes for the new version. Look for breaking changes, migration steps, or deprecated features.
- [ ] **Notify your team** — let users know about planned downtime, especially for major version updates.
- [ ] **Test in a staging environment** (recommended for large teams) — deploy the update to a non-production instance first.

---

## Updating with Docker Compose

### 1. Pull the Latest Code

```bash
cd /path/to/atlantisboard
git pull origin main
```

### 2. Rebuild the Application Container

```bash
docker compose -f docker-compose.prod.yml build
```

This rebuilds the `app` container with the latest code. Other containers (MongoDB, Redis, MinIO) use official images and are updated through their own image tags in the compose file.

### 3. Restart the Stack

```bash
docker compose -f docker-compose.prod.yml up -d
```

Docker Compose will recreate only the containers that have changed. Your data volumes are preserved.

### 4. Verify the Update

```bash
docker compose -f docker-compose.prod.yml ps
```

Confirm all containers are running and healthy. Check the application logs for any startup errors:

```bash
docker compose -f docker-compose.prod.yml logs -f app
```

---

## Updating a Manual Installation

### 1. Stop the Application

```bash
sudo systemctl stop atlantisboard atlantisboard-worker
```

### 2. Pull the Latest Code

```bash
cd /opt/atlantisboard
git pull origin main
```

### 3. Install Dependencies

```bash
bun install
```

### 4. Rebuild

```bash
bun run build
```

### 5. Restart the Application

```bash
sudo systemctl start atlantisboard atlantisboard-worker
```

### 6. Verify

```bash
sudo systemctl status atlantisboard
curl -s http://localhost:3000/health
```

---

## Rolling Back

If an update causes problems, you can roll back to a previous version.

### Docker Rollback

1. Check out the previous version:

```bash
git log --oneline -10  # Find the commit hash of the last known good version
git checkout <commit-hash>
```

2. Rebuild and restart:

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

3. If you need to restore data, use the backup you created before the update. Go to Admin → Backup & Restore and select the backup to restore.

### Manual Rollback

1. Stop the application:

```bash
sudo systemctl stop atlantisboard atlantisboard-worker
```

2. Check out the previous version:

```bash
cd /opt/atlantisboard
git checkout <commit-hash>
```

3. Reinstall dependencies and rebuild:

```bash
bun install
bun run build
```

4. Restart:

```bash
sudo systemctl start atlantisboard atlantisboard-worker
```

> **Warning:** If the new version included database migrations, rolling back the code may not automatically reverse those changes. Restore from a pre-update backup if you need to fully revert both code and data.

---

## Routine Maintenance

### Database Cleanup

Atlantisboard includes built-in database maintenance tools accessible from Admin → Database Maintenance. You can clean up orphaned records, expired sessions, and stale jobs either individually or in bulk.

### Log Rotation

If using the manual installation path, configure log rotation for Pino's structured JSON output. For systemd-managed services, logs go to journald by default and are rotated automatically.

For Docker, use Docker's built-in log rotation:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Add this to `/etc/docker/daemon.json` and restart Docker.

### Checking for Updates

Periodically check the repository for new releases:

```bash
cd /path/to/atlantisboard
git fetch origin
git log HEAD..origin/main --oneline
```

This shows any commits on `main` that you have not yet applied.

---

## See Also

- [Docker Compose Installation](/wiki/docker-compose-install/)
- [Manual Installation](/wiki/manual-install/)
- [Environment Variables Reference](/wiki/environment-variables/)
