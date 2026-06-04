#!/usr/bin/env bash
# Sync root package metadata and Docker build sources into packages/atlantisboard.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PKG_DIR="${PROJECT_ROOT}/packages/atlantisboard"

cd "${PROJECT_ROOT}"

echo "==> Sync packages/atlantisboard/package.json from root"
bun -e "
const root = await Bun.file('package.json').json();
const pkgPath = 'packages/atlantisboard/package.json';
const pkg = await Bun.file(pkgPath).json();
pkg.version = root.version;
pkg.dependencies = root.dependencies;
pkg.devDependencies = {};
if (root.overrides) {
  pkg.overrides = root.overrides;
} else {
  delete pkg.overrides;
}
await Bun.write(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
"

"${SCRIPT_DIR}/sync-docker-build-context.sh" "${PKG_DIR}"

echo "==> Production lockfile for packages/atlantisboard"
rm -f "${PKG_DIR}/bun.lock"
rm -rf "${PKG_DIR}/node_modules"
if ! (cd "${PKG_DIR}" && bun install --lockfile-only); then
  echo "error: bun install --lockfile-only failed in ${PKG_DIR}" >&2
  exit 1
fi
if [[ ! -s "${PKG_DIR}/bun.lock" ]]; then
  echo "error: ${PKG_DIR}/bun.lock was not created" >&2
  exit 1
fi

echo "==> Package prepared at ${PKG_DIR}"
