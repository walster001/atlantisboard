#!/usr/bin/env bash
# Remove CI-only Docker source context from the release npm package / installer zip.
# Email templates are re-copied afterward by copy-release-email-templates.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="${1:-${SCRIPT_DIR}/../packages/atlantisboard}"

rm -rf \
  "${PKG_DIR}/src" \
  "${PKG_DIR}/scripts" \
  "${PKG_DIR}/docker" \
  "${PKG_DIR}/postcss.config.js" \
  "${PKG_DIR}/tailwind.config.js" \
  "${PKG_DIR}/tsconfig.json" \
  "${PKG_DIR}/tsconfig.typecheck.json"

echo "==> Stripped CI-only Docker sources from ${PKG_DIR}"
