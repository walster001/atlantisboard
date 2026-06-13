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

"${SCRIPT_DIR}/assert-bundle-no-host-paths.sh" \
  "${PROJECT_ROOT}/dist/server/index.js" \
  "${PROJECT_ROOT}/dist/workers/index.js" \
  "${PROJECT_ROOT}/dist/workers/backupJobRunner.js"

"${SCRIPT_DIR}/prepare-atlantisboard-package.sh"

echo "==> Copy runtime files into package"
rm -rf "${PKG_DIR}/dist" "${PKG_DIR}/public" "${PKG_DIR}/node_modules"
cp -a dist "${PKG_DIR}/dist"
cp -a public "${PKG_DIR}/public"
find "${PKG_DIR}/dist" -name '*.tsbuildinfo' -delete 2>/dev/null || true

if ! (cd "${PKG_DIR}" && bun install --frozen-lockfile --production --ignore-scripts); then
  echo "error: production install with frozen lockfile failed in ${PKG_DIR}" >&2
  exit 1
fi
rm -rf "${PKG_DIR}/node_modules"

"${SCRIPT_DIR}/strip-release-docker-sources.sh" "${PKG_DIR}"
"${SCRIPT_DIR}/copy-release-email-templates.sh" "${PKG_DIR}"

cp .env.example "${PKG_DIR}/.env.example"
cp DEPLOYMENT.md "${PKG_DIR}/DEPLOYMENT.md"
cp README.md "${PKG_DIR}/README.md"

echo "==> Sync Docker full-stack assets"
mkdir -p "${PKG_DIR}/install/docker/mongodb" "${PKG_DIR}/install/docker/minio"
cp docker/mongodb/init-app-user.js \
  docker/mongodb/replica-init-auth.sh \
  docker/mongodb/docker-entrypoint-with-keyfile.sh \
  "${PKG_DIR}/install/docker/mongodb/"
# install/docker/minio may contain repo symlinks into docker/minio — remove before cp.
rm -f "${PKG_DIR}/install/docker/minio/prod-setup.sh" "${PKG_DIR}/install/docker/minio/app-readwrite-policy.json"
cp docker/minio/prod-setup.sh docker/minio/app-readwrite-policy.json "${PKG_DIR}/install/docker/minio/"
chmod +x "${PKG_DIR}/install/docker/mongodb/replica-init-auth.sh" \
  "${PKG_DIR}/install/docker/mongodb/docker-entrypoint-with-keyfile.sh" \
  "${PKG_DIR}/install/docker/minio/prod-setup.sh" \
  "${PKG_DIR}/install/docker/reset-docker-data.sh" 2>/dev/null || true

cat > "${PKG_DIR}/install/bin/setup.sh" <<'EOF'
#!/usr/bin/env bash
# npm bin entry — delegate to the canonical installer.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
export ATLANTISBOARD_PACKAGE_ROOT="${ATLANTISBOARD_PACKAGE_ROOT:-$PKG_ROOT}"
exec bash "${SCRIPT_DIR}/../setup.sh" "$@"
EOF

chmod +x "${PKG_DIR}/install/setup.sh" "${PKG_DIR}/install/uninstall.sh" "${PKG_DIR}/install/bin/setup.sh" "${PKG_DIR}/install/bin/uninstall.sh" "${PKG_DIR}/install/bin/atlantisboard.js" 2>/dev/null || true
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
cat > "${PKG_DIR}/atlantisboard-uninstall" <<'EOF'
#!/usr/bin/env bash
# Run the Whiptail uninstaller from an extracted release zip (Linux).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export ATLANTISBOARD_PACKAGE_ROOT="$ROOT"
exec bash "${ROOT}/install/uninstall.sh" "$@"
EOF
chmod +x "${PKG_DIR}/atlantisboard-uninstall"

if [[ ! -s "${PKG_DIR}/bun.lock" ]]; then
  echo "error: ${PKG_DIR}/bun.lock missing after package build — aborting" >&2
  exit 1
fi

echo "==> Package ready at ${PKG_DIR} (bun.lock $(wc -c <"${PKG_DIR}/bun.lock") bytes)"
echo "    Dry run: (cd packages/atlantisboard && npm pack)"
