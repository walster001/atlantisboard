#!/usr/bin/env bash
# npm bin entry — delegate to the canonical uninstaller.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
export ATLANTISBOARD_PACKAGE_ROOT="${ATLANTISBOARD_PACKAGE_ROOT:-$PKG_ROOT}"
exec bash "${SCRIPT_DIR}/../uninstall.sh" "$@"
