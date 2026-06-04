#!/usr/bin/env bash
# Sync monorepo sources into packages/atlantisboard for in-Docker builds.
# Used by build-npm-package.sh and CI Docker image jobs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PKG_DIR="${1:-${PROJECT_ROOT}/packages/atlantisboard}"

cd "${PROJECT_ROOT}"

if [[ ! -f "${PKG_DIR}/package.json" ]]; then
  echo "error: ${PKG_DIR}/package.json not found" >&2
  exit 1
fi

echo "==> Sync Docker build context into ${PKG_DIR}"

mkdir -p "${PKG_DIR}/docker"

cp package.json "${PKG_DIR}/docker/root.package.json"
cp bun.lock "${PKG_DIR}/docker/root.bun.lock"

rsync -a --delete \
  --exclude node_modules \
  "${PROJECT_ROOT}/src/" "${PKG_DIR}/src/"

rsync -a --delete \
  "${PROJECT_ROOT}/scripts/" "${PKG_DIR}/scripts/"

cp postcss.config.js tailwind.config.js tsconfig.json \
  tsconfig.typecheck.json "${PKG_DIR}/"

if [[ -d "${PROJECT_ROOT}/public" ]]; then
  rsync -a "${PROJECT_ROOT}/public/" "${PKG_DIR}/public/"
fi

echo "==> Docker build context ready"
