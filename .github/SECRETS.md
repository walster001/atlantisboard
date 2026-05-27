# GitHub Actions secrets

This repository is public. **Do not put secret values in workflow YAML.** Configure secrets in the GitHub UI only.

## Repository secrets (CI, Staging, Deploy verify)

Used by `.github/workflows/reusable-verify.yml` for integration tests. Each value must be **at least 32 characters**. Use unique random strings (not production values).

| Secret name | Used for |
|-------------|----------|
| `CI_SESSION_SECRET` | `SESSION_SECRET` in test runs |
| `CI_JWT_SECRET` | `JWT_SECRET` |
| `CI_CSRF_SECRET` | `CSRF_SECRET` |
| `CI_ENCRYPTION_KEY` | `ENCRYPTION_KEY` |
| `CI_MEDIA_SIGN_SECRET` | `MEDIA_SIGN_SECRET` (must differ from `CI_JWT_SECRET`) |

**Settings → Secrets and variables → Actions → New repository secret**

Generate values locally (example — run once per secret, store only in GitHub):

```bash
openssl rand -base64 48
```

`MONGODB_URI` / `REDIS_*` in workflows point at ephemeral service containers on `localhost`; those connection strings are not secrets.

## npm publish (production) — OIDC trusted publisher, not `NPM_TOKEN`

**Deploy to Production** publishes with [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) (short-lived OIDC credentials). You do **not** need a long-lived `NPM_TOKEN` for release.

### One-time setup on npmjs.com

1. Open the **`atlantisboard`** package → **Settings** → **Trusted publishing**.
2. Add **GitHub Actions** with values that match this repo exactly (case-sensitive):

| npm field | Value |
|-----------|--------|
| Repository | `walster001/atlantisboard` (owner/repo of this GitHub repo) |
| Workflow filename | `deploy-production.yml` |
| Environment | `production` |

3. Allow **`npm publish`** (required for this workflow).
4. Ensure `packages/atlantisboard/package.json` **`repository.url`** matches that GitHub repo (required for OIDC validation).
5. After a successful OIDC publish, consider **Settings → Publishing access → Require 2FA and disallow tokens** so only trusted publishing (and manual 2FA) can publish.

### GitHub environment

Create **Settings → Environments → `production`** for approval rules / branch protection. **No npm secret is required** on that environment for OIDC publish.

Workflow requirements (already configured in `deploy-production.yml`):

- `permissions: id-token: write`
- npm CLI **≥ 11.5.1** (installed in the release job)
- Node **≥ 22.14** (via `setup-node` Node 22 on hosted runners)
- Do **not** set `NODE_AUTH_TOKEN` on the publish step (it overrides OIDC)

Provenance attestations are generated automatically for public packages published from a public repo.

### Optional: read-only token for private npm dependencies

If the build ever needs to `npm install` private packages from npm, add a **read-only** granular token as a repository secret (e.g. `NPM_READ_TOKEN`) and pass it only to install/ci steps — **not** to `npm publish`. This project uses Bun and does not need that today.

## Built-in (no configuration)

- `GITHUB_TOKEN` / `github.token` — GitHub Releases and tag push

## Forked pull requests

Secrets are not passed to workflows from fork PRs (GitHub default). Maintainers must run CI on branches in the main repository.
