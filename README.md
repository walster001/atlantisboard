# Kanboard (Atlantisboard)

[![CI](https://github.com/your-org/atlantisboard/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/atlantisboard/actions/workflows/ci.yml)
[![Staging](https://github.com/your-org/atlantisboard/actions/workflows/staging.yml/badge.svg)](https://github.com/your-org/atlantisboard/actions/workflows/staging.yml)

Self-hosted Kanban-style boards: **workspaces**, **lists**, **cards**, permissions, invites, import/export, and live collaboration so your team sees updates without constantly refreshing.

Production install via npm: `npm install -g atlantisboard` then `atlantisboard-setup` — see [npm install wiki](docs/wiki/npm-install.md).

---

## Quick links

| Document | Use it when… |
|----------|----------------|
| **[User wiki](docs/wiki/Home.md)** | You want to learn the product screens — sign-in, home, boards, cards, board settings (including audit log), admin, imports, PWA |
| **[Developer setup](docs/developer/setup.md)** | You are installing, configuring `.env`, running Docker or production builds, or need the HTTP API overview |
| **[Specifications](specifications.md)** | You need architecture, security, and requirements detail |

---

## Quick start (developers)

From the repository root, the fastest local path is:

```bash
./scripts/dev-deploy.sh
```

Then open **http://localhost:3000** (or the host/port in your `.env`). Full prerequisites, manual steps, WSL/LAN tips, production deployment, and background workers are in [docs/developer/setup.md](docs/developer/setup.md).

---

## Highlights

- **Multi-workspace** home with board tiles; drag to reorder when allowed  
- **Kanban** board with drag-and-drop cards and lists; mobile-friendly list navigation  
- **Rich cards** — description, assignees, labels, dates, checklists, comments, attachments, reminders  
- **Board settings** — card/list defaults, labels, members, theme and background, **audit** activity  
- **Invites** — board (and workspace) sharing with roles  
- **Import / export** — e.g. Trello-style JSON import; board export as JSON/CSV where enabled  
- **Site admin** — login options, branding, users, permissions, backup, monitoring (some sub-sections may still be placeholders)  
- **PWA-style** install prompt and offline-oriented notices  

Roadmap items in older marketing copy (for example some template or CSV flows) may still be **planned** — trust what you see in the UI and the wiki.

---

## Contributing

Fork, branch, commit, push, and open a pull request. Run typecheck and tests as in [docs/developer/setup.md](docs/developer/setup.md) before submitting.

---

## Releases (maintainers)

1. Update version in root `package.json` and add a `## [x.y.z]` section to [CHANGELOG.md](CHANGELOG.md). **The version must not already exist on npm** (the workflow checks before building).
2. Merge to `main` and confirm **CI** is green. Run **Staging** (Actions → workflow_dispatch) on the target ref — uploads **installer** (`atlantisboard-<version>.zip`) and **runtime-only** (`atlantisboard-<version>-runtime.zip`) artifacts.
3. Run **Deploy to Production** (Actions → workflow_dispatch): set **version** if it differs from `package.json`, confirm CHANGELOG, publish to npm (`atlantisboard`), create GitHub Release with both zips and notes.

**GitHub secrets:** See [.github/SECRETS.md](.github/SECRETS.md) — repository `CI_*` secrets for tests; npm publish uses **OIDC trusted publishing** (configure on npmjs.com, no `NPM_TOKEN`).

Local dry run:

```bash
./scripts/build-npm-package.sh
./scripts/release-installer-zip.sh
./scripts/release-bundle.sh --skip-build
(cd packages/atlantisboard && npm pack)
```

---

## License

MIT — see `package.json`.

---

## Security

Follow OWASP-minded practices in development and deployment. If you find a security vulnerability, report it through your project’s private channel (replace placeholder contact in policies as needed); do not use the public issue tracker for undisclosed vulnerabilities.

---

## Acknowledgments

Inspired by Trello, Wekan, and Atlantisboard; built with Bun, React, MongoDB, and the stack listed in `package.json`.
