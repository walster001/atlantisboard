#!/usr/bin/env sh
# PostCSS requires nanoid/non-secure; a corrupted Bun install cache can leave zero-byte files.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NANOID_NON_SECURE="${PROJECT_ROOT}/node_modules/nanoid/non-secure/index.cjs"

nanoid_corrupt_message() {
  echo "❌ nanoid is missing or corrupt (empty files). PostCSS needs nanoid/non-secure." >&2
  echo "   Repair: rm -rf node_modules/nanoid ~/.bun/install/cache/nanoid@* && bun install" >&2
}

case "${1:-check}" in
  check)
    if [ ! -s "${NANOID_NON_SECURE}" ]; then
      nanoid_corrupt_message
      exit 1
    fi
    ;;
  repair-if-needed)
    if [ ! -s "${NANOID_NON_SECURE}" ]; then
      echo "==> Repairing corrupt nanoid install (empty files in Bun cache)"
      rm -rf "${HOME}/.bun/install/cache/nanoid@"* "${PROJECT_ROOT}/node_modules/nanoid"
      bun install --frozen-lockfile
    fi
    ;;
  *)
    echo "usage: $0 [check|repair-if-needed]" >&2
    exit 2
    ;;
esac
