#!/usr/bin/env bash
# Sync bundled privacy notice into public/ for runtime and release packaging.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC="${PROJECT_ROOT}/src/server/legal/privacy-policy.md"
DEST_DIR="${PROJECT_ROOT}/public/legal"
DEST="${DEST_DIR}/privacy-policy.md"

if [[ ! -s "${SRC}" ]]; then
  echo "error: missing privacy policy source at ${SRC}" >&2
  exit 1
fi

mkdir -p "${DEST_DIR}"
cp "${SRC}" "${DEST}"
