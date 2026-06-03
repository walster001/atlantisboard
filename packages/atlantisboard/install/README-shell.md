# Installer Shell Notes

Atlantisboard installer scripts in this directory are **bash-first**.
Runtime launchers may use `#!/usr/bin/env bash`, while POSIX-only scripts keep
`#!/bin/sh` when required (for example `install/docker/minio/prod-setup.sh`).

## Library Layout

- `install/lib/common.sh`: loader (`err`/`info`, `set -euo pipefail`); sources:
  - `common-whiptail.sh` — theme and whiptail TTY wrappers
  - `common-env.sh` — `.env` I/O, validation, prompts
  - `common-docker.sh` — compose, health waits, compose-or-continue
  - `common-systemd.sh` — preflight, Bun, systemd, ports
- `install/lib/uninstall-lib.sh`: uninstall discovery/removal (after `common.sh`)
- `install/setup.sh` / `install/uninstall.sh`: entry scripts with `main "$@"`
- `install/reverse-proxy.sh`: sourced HTTPS wizard (nginx/caddy)

## Contributor Check

Run ShellCheck locally before submitting installer shell changes:

```bash
shellcheck -x -e SC1090,SC1091 packages/atlantisboard/install/setup.sh \
  packages/atlantisboard/install/**/*.sh
```
