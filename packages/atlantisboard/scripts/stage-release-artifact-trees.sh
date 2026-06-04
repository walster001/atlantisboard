#!/usr/bin/env bash
# Flat directory trees for GitHub Actions upload-artifact (avoids zip-in-zip downloads).
# Run after ./scripts/build-npm-package.sh (and optionally after release zip scripts).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PKG_DIR="${PROJECT_ROOT}/packages/atlantisboard"
INSTALLER_STAGE="${PROJECT_ROOT}/release/staging-installer"
RUNTIME_STAGE="${PROJECT_ROOT}/release/staging-runtime"

cd "$PROJECT_ROOT"

for required in \
  "${PKG_DIR}/dist/server/index.js" \
  "${PKG_DIR}/install/setup.sh" \
  dist/server/index.js; do
  if [[ ! -e "$required" ]]; then
    echo "error: missing ${required} — run ./scripts/build-npm-package.sh first" >&2
    exit 1
  fi
done

rm -rf "$INSTALLER_STAGE" "$RUNTIME_STAGE"
mkdir -p "$INSTALLER_STAGE" "$RUNTIME_STAGE"

echo "==> Staging installer tree (Whiptail package contents at artifact root)"
cp -a "${PKG_DIR}/." "$INSTALLER_STAGE/"

echo "==> Staging runtime tree (slim manual install at artifact root)"
cp -a dist public package.json bun.lock README.md DEPLOYMENT.md "$RUNTIME_STAGE/"

echo "==> wrote ${INSTALLER_STAGE}/"
echo "==> wrote ${RUNTIME_STAGE}/"
echo "    Upload these directories with actions/upload-artifact — not release/*.zip (prevents nested zips)."
