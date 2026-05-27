#!/usr/bin/env bash
# Build production artifacts and assemble packages/atlantisboard for npm publish.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PKG_DIR="${PROJECT_ROOT}/packages/atlantisboard"

cd "$PROJECT_ROOT"

VERSION="$(bun -e 'console.log((await Bun.file("package.json").json()).version)')"
echo "==> Building atlantisboard npm package v${VERSION}"

echo "==> bun install --frozen-lockfile"
bun install --frozen-lockfile

echo "==> build:client"
bun run build:client

echo "==> build"
bun run build

echo "==> Sync version to packages/atlantisboard/package.json"
bun -e "
const root = await Bun.file('package.json').json();
const pkgPath = 'packages/atlantisboard/package.json';
const pkg = await Bun.file(pkgPath).json();
pkg.version = root.version;
await Bun.write(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
"

echo "==> Copy runtime files into package"
rm -rf "${PKG_DIR}/dist" "${PKG_DIR}/public" "${PKG_DIR}/node_modules"
cp -a dist "${PKG_DIR}/dist"
cp -a public "${PKG_DIR}/public"
cp bun.lock "${PKG_DIR}/bun.lock"
cp .env.example "${PKG_DIR}/.env.example"
cp DEPLOYMENT.md "${PKG_DIR}/DEPLOYMENT.md"
cp README.md "${PKG_DIR}/README.md"

cp -f "${PKG_DIR}/install/setup.sh" "${PKG_DIR}/install/bin/setup.sh"
chmod +x "${PKG_DIR}/install/setup.sh" "${PKG_DIR}/install/bin/setup.sh" "${PKG_DIR}/install/bin/atlantisboard.js" 2>/dev/null || true
chmod +x "${PKG_DIR}/install/docker/mongodb/replica-init.sh" 2>/dev/null || true

echo "==> Package ready at ${PKG_DIR}"
echo "    Dry run: (cd packages/atlantisboard && npm pack)"
