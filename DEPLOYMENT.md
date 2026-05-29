# Deployment overview

Atlantisboard (Kanboard) can be installed for production using:

1. **npm (recommended for bare-metal / VM)** — `npm install -g atlantisboard`, then `atlantisboard-setup` (interactive Whiptail wizard on Linux).
2. **GitHub Release installer zip** — download `atlantisboard-<version>.zip` from [GitHub Releases](https://github.com/walster001/atlantisboard/releases), extract, run `sudo ./atlantisboard-setup` (same Whiptail wizard and full-stack Docker option as npm).
3. **GitHub Release runtime zip (advanced)** — `atlantisboard-<version>-runtime.zip` contains only built assets (`dist/`, `public/`, lockfile). Extract, configure `.env` manually, `bun install --production`, run with systemd or your own Docker Compose — **no Whiptail installer**.
4. **Docker Compose (from source)** — see [docs/wiki/docker-compose-install.md](docs/wiki/docker-compose-install.md).
5. **Manual install** — see [docs/wiki/manual-install.md](docs/wiki/manual-install.md).

**Release artifacts (maintainers):**

| File | Contents |
|------|----------|
| `atlantisboard-<version>.zip` | Full npm package tree: Whiptail installer, Docker full-stack compose, systemd templates |
| `atlantisboard-<version>-runtime.zip` | Runtime-only slim bundle for manual deployment |

Both zips are built from the same `build-npm-package.sh` run; see `scripts/release-installer-zip.sh` and `scripts/release-bundle.sh`.

Environment variables: [docs/wiki/environment-variables.md](docs/wiki/environment-variables.md).

## MongoDB oplog sizing (change streams)

Change streams read the replica set **oplog**. If the oplog rolls over before a restarted Atlantisboard node resumes (resume tokens are stored in Redis — see [Real-Time Collaboration](docs/wiki/realtime.md)), events can be missed.

**Recommendation:** size the oplog to retain at least **24–48 hours** of writes at your peak workload. On self-hosted replica sets, set [`replication.oplogSizeMB`](https://www.mongodb.com/docs/manual/reference/configuration-options/#mongodb-setting-replication.oplogSizeMB) (or the equivalent Atlas oplog window). After changing oplog size, verify headroom with `db.getReplicationInfo()` in `mongosh`.

Maintainers: see README **Releases** and `.github/workflows/deploy-production.yml`.
