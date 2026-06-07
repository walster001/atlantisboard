# Docker dev data persistence

Local development uses **host bind mounts** under `.docker-data/` (configurable via `KANBOARD_DOCKER_DATA_DIR` in `.env`). MongoDB, Redis, and MinIO read/write directly to directories on your machine, not only to anonymous Docker named volumes.

## Why this matters

Previously, data lived in Docker **named volumes** (for example `atlboard-new_mongo-data`). Those survive `docker compose stop` and `docker compose down`, but you can still lose everything if you:

- run `docker compose down -v` (removes volumes)
- run `docker volume prune` or `docker system prune --volumes`
- reset Docker Desktop / WSL and delete volumes
- clone the repo under a new folder name (Compose project name changes → **new** volume names)

Bind mounts keep files in a visible project folder you can back up, copy, and restore.

## Layout

```
.docker-data/
  mongodb/db/          → MongoDB database files
  mongodb/configdb/    → MongoDB replica set config
  redis/               → Redis AOF/RDB
  minio/               → MinIO buckets/objects
  README.txt           → safety notes (auto-created)
```

Override the root path:

```bash
# .env
KANBOARD_DOCKER_DATA_DIR=/home/you/kanboard-dev-data
```

## Safe commands

```bash
./scripts/dev-start.sh          # creates .docker-data if missing, starts stack
docker compose stop             # stops containers; data kept
docker compose down             # removes containers; data kept (no -v)
docker compose up -d            # recreates containers; reuses .docker-data
```

## Destructive commands (avoid unless you want a blank environment)

```bash
docker compose down -v          # removes Compose volumes (bind data is NOT removed)
docker volume prune             # may delete old named volumes from previous setups
docker system prune --volumes   # same risk for any unused named volumes
rm -rf .docker-data             # deletes all local dev DB + MinIO data
```

> `down -v` does **not** delete `.docker-data/` when using bind mounts. It only removes named volumes declared in Compose. Your live data is still under `.docker-data/` unless you delete that folder yourself.

## Migrate from old named volumes

If you still have data in Docker volumes from before this change (for example `atlboard-new_mongo-data`):

```bash
docker compose stop mongodb
./scripts/migrate-legacy-docker-volumes.sh --replace
docker compose up -d mongodb
docker compose up --no-deps mongodb-init
```

**Do not** copy legacy volume data into a non-empty `.docker-data/mongodb/db` with plain `docker run … cp -a` — merging two WiredTiger trees corrupts the journal and MongoDB will exit with code 14. Use the script (it replaces the directory atomically) or move the old bind mount aside first.

Or copy manually (MongoDB must be stopped; destination must be empty):

```bash
docker run --rm \
  -v atlboard-new_mongo-data:/from:ro \
  -v "$(pwd)/.docker-data/mongodb/db":/to \
  alpine:3.20 sh -c 'cp -a /from/. /to/'
```

Repeat for `atlboard-new_redis-data` → `.docker-data/redis` and `atlboard-new_minio-data` → `.docker-data/minio`.

## Backup

- Copy the whole `.docker-data` directory, or
- Use the app’s **Admin → Backups** feature (`BACKUP_LOCATION` in `.env`), or
- Run `tar -czf kanboard-docker-data-$(date +%F).tar.gz .docker-data`

## Network exposure (dev compose)

Root `docker-compose.yml` publishes MongoDB (27017), Redis (6379), and MinIO (9000/9001) on **127.0.0.1** only so host tools can connect via `localhost` without binding on all interfaces. Do not remove loopback binding or deploy this file unchanged on a public host; use `docker-compose.prod.yml` for production.

When the app runs in a container, `HOST=0.0.0.0` is correct so the process listens inside the container network namespace; expose it to users only through a reverse proxy and host firewall, not by widening data-store port mappings.
