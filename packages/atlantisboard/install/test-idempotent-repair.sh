#!/usr/bin/env bash
# Dry-run checks for idempotent repair helpers (no whiptail, no sudo).
# Usage: bash packages/atlantisboard/install/test-idempotent-repair.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
export ATLANTISBOARD_PACKAGE_ROOT="$PKG_ROOT"
export ATLANTISBOARD_SKIP_PKG_INSTALL=1

INSTALL_DIR="$(mktemp -d)"
PKG_MIRROR="$(mktemp -d)"
trap 'rm -rf "$INSTALL_DIR" "$PKG_MIRROR"' EXIT

declare -A ENV_VALUES

# shellcheck source=lib/common.sh
source "${PKG_ROOT}/install/lib/common.sh"

atl_sudo() {
  "$@"
}

fail() {
  echo "test-idempotent-repair: $*" >&2
  exit 1
}

# packages/atlantisboard/bun.lock is gitignored; CI checkouts use the repo-root lockfile.
atl_pkg_bun_lock() {
  if [[ -s "${PKG_ROOT}/bun.lock" ]]; then
    printf '%s\n' "${PKG_ROOT}/bun.lock"
    return 0
  fi
  local repo_lock="${PKG_ROOT}/../../bun.lock"
  if [[ -s "$repo_lock" ]]; then
    printf '%s\n' "$repo_lock"
    return 0
  fi
  fail "bun.lock not found (expected ${PKG_ROOT}/bun.lock or ${repo_lock})"
}

seed_install_tree() {
  local root="$1"
  local bun_lock
  bun_lock="$(atl_pkg_bun_lock)"
  mkdir -p "${root}/dist/server" "${root}/dist/workers" "${root}/public"
  mkdir -p "${root}/install/lib" "${root}/install/docker"
  touch "${root}/dist/server/index.js"
  touch "${root}/dist/workers/index.js"
  touch "${root}/public/index.js"
  cp -a "${PKG_ROOT}/install/setup.sh" "${root}/install/"
  cp -a "${PKG_ROOT}/install/lib/"*.sh "${root}/install/lib/"
  cp -a "${PKG_ROOT}/install/env-fields.json" "${root}/install/"
  cp -a "${PKG_ROOT}/package.json" \
    "${PKG_ROOT}/atlantisboard" "${PKG_ROOT}/atlantisboard-setup" \
    "${root}/"
  cp -a "$bun_lock" "${root}/bun.lock"
  cp -a "${PKG_ROOT}/install/docker/"*.yml "${root}/install/docker/" 2>/dev/null || true
  cp -a "${PKG_ROOT}/install/docker/"*.env "${root}/install/docker/" 2>/dev/null || true
  cp -a "${PKG_ROOT}/install/docker/Dockerfile" \
    "${PKG_ROOT}/install/docker/entrypoint.sh" \
    "${PKG_ROOT}/install/docker/reset-docker-data.sh" \
    "${root}/install/docker/" 2>/dev/null || true
}

state="$(atl_detect_existing_install "$INSTALL_DIR")"
[[ "$state" == "none" ]] \
  || fail "empty dir should be none, got ${state}"

mkdir -p "${INSTALL_DIR}/dist/server"
touch "${INSTALL_DIR}/package.json"
state="$(atl_detect_existing_install "$INSTALL_DIR")"
[[ "$state" == "partial" ]] \
  || fail "package.json only should be partial, got ${state}"

touch "${INSTALL_DIR}/.env" \
  "${INSTALL_DIR}/dist/server/index.js"
mkdir -p "${INSTALL_DIR}/install"
touch "${INSTALL_DIR}/install/setup.sh"
state="$(atl_detect_existing_install "$INSTALL_DIR")"
[[ "$state" == "complete" ]] \
  || fail "all markers should be complete, got ${state}"

seed_install_tree "$PKG_MIRROR"
seed_install_tree "$INSTALL_DIR"
read -r missing mismatched _ \
  <<< "$(atl_verify_install_integrity "$PKG_MIRROR" "$INSTALL_DIR")"
[[ "$missing" -eq 0 && "$mismatched" -eq 0 ]] \
  || fail "mirrored tree should verify (missing=${missing} mismatched=${mismatched})"

rm -f "${INSTALL_DIR}/dist/workers/index.js"
repaired="$(atl_repair_install_files "$PKG_MIRROR" "$INSTALL_DIR")"
[[ "${repaired:-0}" -ge 1 ]] \
  || fail "repair should restore missing worker bundle"
[[ -f "${INSTALL_DIR}/dist/workers/index.js" ]] \
  || fail "worker bundle still missing after repair"

printf '%s\n' 'JWT_SECRET=from-file' 'PORT=3000' >"${INSTALL_DIR}/.env"
ENV_VALUES=()
atl_load_env_file_into_values "${INSTALL_DIR}/.env"
[[ "${ENV_VALUES[JWT_SECRET]:-}" == "from-file" ]] \
  || fail "load env into values failed"

echo "test-idempotent-repair: all checks passed"
