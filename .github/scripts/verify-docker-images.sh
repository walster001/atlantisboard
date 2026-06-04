#!/usr/bin/env bash
# Build installer Docker targets after packages/atlantisboard is prepared.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PKG="${ROOT}/packages/atlantisboard"
DOCKERFILE="${PKG}/install/docker/Dockerfile"

cd "${ROOT}"

if [[ ! -f "${PKG}/docker/root.bun.lock" ]]; then
  echo "error: run scripts/prepare-atlantisboard-package.sh or build-npm-package.sh first" >&2
  exit 1
fi

echo "==> Docker build --target development (CI)"
docker build --target development -f "${DOCKERFILE}" "${PKG}"

echo "==> Docker build --target production (staging / production)"
prod_id="$(
  docker build --target production -f "${DOCKERFILE}" -q "${PKG}"
)"

echo "==> Assert production bundle has no CI runner paths"
if docker run --rm "${prod_id}" \
  grep -q 'runner/work/atlantisboard' /app/dist/server/index.js 2>/dev/null; then
  echo "error: dist/server/index.js still embeds GitHub Actions paths" >&2
  exit 1
fi

echo "==> Docker images OK"
