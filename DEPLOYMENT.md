# Deployment overview

Atlantisboard (Kanboard) can be installed for production using:

1. **npm (recommended for bare-metal / VM)** — `npm install -g atlantisboard`, then `atlantisboard-setup` (interactive Whiptail wizard on Linux).
2. **Release zip** — download `atlantisboard-<version>.zip` from GitHub Releases, extract, `bun install --production`, configure `.env`, run with systemd or Docker dependencies.
3. **Docker Compose** — see [docs/wiki/docker-compose-install.md](docs/wiki/docker-compose-install.md).
4. **Manual install** — see [docs/wiki/manual-install.md](docs/wiki/manual-install.md).

Environment variables: [docs/wiki/environment-variables.md](docs/wiki/environment-variables.md).

Maintainers: see README **Releases** and `.github/workflows/deploy-production.yml`.
