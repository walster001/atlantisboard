# Deployment overview

Atlantisboard (Kanboard) can be installed for production using:

1. **npm (recommended for bare-metal / VM)** — `npm install -g atlantisboard`, then `atlantisboard-setup` (interactive Whiptail wizard on Linux).
2. **Release zip** — download `atlantisboard-<version>.zip` from GitHub Releases, extract, `bun install --production`, configure `.env`, run with systemd or Docker dependencies.
3. **Docker Compose** — see [docs/wiki/docker-compose-install.md](docs/wiki/docker-compose-install.md).
4. **Manual install** — see [docs/wiki/manual-install.md](docs/wiki/manual-install.md).

Environment variables: [docs/wiki/environment-variables.md](docs/wiki/environment-variables.md).

## MongoDB oplog sizing (change streams)

Change streams read the replica set **oplog**. If the oplog rolls over before a restarted Atlantisboard node resumes (resume tokens are stored in Redis — see [Real-Time Collaboration](docs/wiki/realtime.md)), events can be missed.

**Recommendation:** size the oplog to retain at least **24–48 hours** of writes at your peak workload. On self-hosted replica sets, set [`replication.oplogSizeMB`](https://www.mongodb.com/docs/manual/reference/configuration-options/#mongodb-setting-replication.oplogSizeMB) (or the equivalent Atlas oplog window). After changing oplog size, verify headroom with `db.getReplicationInfo()` in `mongosh`.

Maintainers: see README **Releases** and `.github/workflows/deploy-production.yml`.
