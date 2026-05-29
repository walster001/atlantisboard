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

# PostCSS requires nanoid/non-secure; a corrupted Bun install cache can leave zero-byte files.
NANOID_NON_SECURE="${PROJECT_ROOT}/node_modules/nanoid/non-secure/index.cjs"
if [[ ! -s "${NANOID_NON_SECURE}" ]]; then
  echo "==> Repairing corrupt nanoid install (empty files in Bun cache)"
  rm -rf "${HOME}/.bun/install/cache/nanoid@"* "${PROJECT_ROOT}/node_modules/nanoid"
  bun install --frozen-lockfile
fi

echo "==> build:client"
bun run build:client

echo "==> build"
bun run build

echo "==> Sync version and production dependencies to packages/atlantisboard/package.json"
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

echo "==> Copy runtime files into package"
rm -rf "${PKG_DIR}/dist" "${PKG_DIR}/public" "${PKG_DIR}/node_modules"
cp -a dist "${PKG_DIR}/dist"
cp -a public "${PKG_DIR}/public"
find "${PKG_DIR}/dist" -name '*.tsbuildinfo' -delete 2>/dev/null || true
cp bun.lock "${PKG_DIR}/bun.lock"
cp .env.example "${PKG_DIR}/.env.example"
cp DEPLOYMENT.md "${PKG_DIR}/DEPLOYMENT.md"
cp README.md "${PKG_DIR}/README.md"

echo "==> Sync Docker full-stack assets"
mkdir -p "${PKG_DIR}/install/docker/mongodb" "${PKG_DIR}/install/docker/minio"
cp docker/mongodb/init-app-user.js "${PKG_DIR}/install/docker/mongodb/"
cp docker/mongodb/replica-init.sh "${PKG_DIR}/install/docker/mongodb/replica-init-auth.sh"
cp docker/minio/prod-setup.sh docker/minio/app-readwrite-policy.json "${PKG_DIR}/install/docker/minio/"
chmod +x "${PKG_DIR}/install/docker/mongodb/replica-init-auth.sh" \
  "${PKG_DIR}/install/docker/minio/prod-setup.sh" 2>/dev/null || true

cp -f "${PKG_DIR}/install/setup.sh" "${PKG_DIR}/install/bin/setup.sh"
chmod +x "${PKG_DIR}/install/setup.sh" "${PKG_DIR}/install/bin/setup.sh" "${PKG_DIR}/install/bin/atlantisboard.js" 2>/dev/null || true
chmod +x "${PKG_DIR}/install/docker/mongodb/replica-init.sh" 2>/dev/null || true

echo "==> Root launchers for GitHub zip extract (same tree as npm publish)"
cat > "${PKG_DIR}/atlantisboard-setup" <<'EOF'
#!/usr/bin/env bash
# Run the Whiptail installer from an extracted release zip (Linux).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export ATLANTISBOARD_PACKAGE_ROOT="$ROOT"
exec bash "${ROOT}/install/setup.sh" "$@"
EOF
cat > "${PKG_DIR}/atlantisboard" <<'EOF'
#!/usr/bin/env bash
# CLI wrapper when running from an extracted release zip.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "${ROOT}/install/bin/atlantisboard.js" "$@"
EOF
chmod +x "${PKG_DIR}/atlantisboard-setup" "${PKG_DIR}/atlantisboard"

echo "==> Package ready at ${PKG_DIR}"
echo "    Dry run: (cd packages/atlantisboard && npm pack)"
