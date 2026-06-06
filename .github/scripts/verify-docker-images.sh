#!/usr/bin/env bash
# Verify installer Docker targets after packages/atlantisboard is prepared.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PKG="${ROOT}/packages/atlantisboard"
DOCKERFILE="${PKG}/install/docker/Dockerfile"

cd "${ROOT}"

if [[ ! -f "${PKG}/dist/server/index.js" ]]; then
  echo "error: ${PKG}/dist/server/index.js missing — run build-npm-package.sh first" >&2
  exit 1
fi

echo "==> Docker build --target production (release / staging artifact)"
prod_id="$(
  docker build --target production -f "${DOCKERFILE}" -q "${PKG}"
)"

echo "==> Assert production bundle has no CI runner paths"
docker run --rm \
  -v "${ROOT}/scripts/assert-bundle-no-host-paths.sh:/assert-bundle-no-host-paths.sh:ro" \
  "${prod_id}" \
  sh /assert-bundle-no-host-paths.sh /app/dist/server/index.js /app/dist/workers/index.js

echo "==> Docker build --target development (CI source compile)"
SYNC_DOCKER_BUILD_SOURCES=1 ./scripts/sync-docker-build-context.sh "${PKG}"
dockerignore="${PKG}/.dockerignore"
dockerignore_bak="${PKG}/.dockerignore.release-only"
if [[ -f "${dockerignore}" ]]; then
  mv "${dockerignore}" "${dockerignore_bak}"
fi
restore_dockerignore() {
  if [[ -f "${dockerignore_bak}" ]]; then
    mv "${dockerignore_bak}" "${dockerignore}"
  fi
}
trap restore_dockerignore EXIT
docker build --target development -f "${DOCKERFILE}" "${PKG}"
restore_dockerignore
trap - EXIT
"${ROOT}/scripts/strip-release-docker-sources.sh" "${PKG}"

echo "==> Docker images OK"
