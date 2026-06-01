#!/usr/bin/env bash
# Zip packages/atlantisboard (Whiptail installer bundle) for GitHub Releases / staging.
# Run ./scripts/build-npm-package.sh first.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PKG_DIR="${PROJECT_ROOT}/packages/atlantisboard"

cd "$PROJECT_ROOT"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is not on PATH" >&2
  exit 1
fi

VERSION="$(bun -e 'console.log((await Bun.file("package.json").json()).version)')"
if [[ -z "$VERSION" ]]; then
  echo "error: could not read version from package.json" >&2
  exit 1
fi

for required in dist/server/index.js install/setup.sh install/env-fields.json package.json bun.lock; do
  if [[ ! -e "${PKG_DIR}/${required}" ]]; then
    echo "error: missing ${PKG_DIR}/${required} — run ./scripts/build-npm-package.sh first" >&2
    exit 1
  fi
done

echo "==> Verify package lockfile matches package.json (Docker full-stack + setup.sh use --frozen-lockfile)"
(
  cd "${PKG_DIR}"
  rm -rf node_modules
  bun install --frozen-lockfile --production --ignore-scripts
  rm -rf node_modules
)

ZIP_NAME="atlantisboard-${VERSION}.zip"
ZIP_PATH="release/${ZIP_NAME}"

mkdir -p release
rm -f "$ZIP_PATH"

echo "==> Installer zip (Whiptail wizard + full-stack Docker) v${VERSION}"
(
  cd "$PKG_DIR"
  zip -qr "${PROJECT_ROOT}/${ZIP_PATH}" . \
    -x 'node_modules/*' \
    -x 'node_modules/**'
)

echo "==> wrote ${ZIP_PATH}"
echo "    On a Linux VM: unzip, then sudo ./atlantisboard-setup"
