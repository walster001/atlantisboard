#!/usr/bin/env bash
# Copy Handlebars email templates into the release npm package / installer zip.
# Runtime resolves templates at src/server/emails (see emailService.ts).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PKG_DIR="${1:-${PROJECT_ROOT}/packages/atlantisboard}"
SRC_DIR="${PROJECT_ROOT}/src/server/emails"
DEST_DIR="${PKG_DIR}/src/server/emails"

REQUIRED_TEMPLATES=(
  test.handlebars
  password-reset.handlebars
  verify-email.handlebars
  board-activity-roundup.handlebars
  layouts/main.handlebars
)

if [[ ! -d "${SRC_DIR}" ]]; then
  echo "error: email templates missing at ${SRC_DIR}" >&2
  exit 1
fi

for rel in "${REQUIRED_TEMPLATES[@]}"; do
  if [[ ! -f "${SRC_DIR}/${rel}" ]]; then
    echo "error: required email template missing: ${SRC_DIR}/${rel}" >&2
    exit 1
  fi
done

rm -rf "${DEST_DIR}"
mkdir -p "$(dirname "${DEST_DIR}")"
cp -a "${SRC_DIR}" "${DEST_DIR}"

for rel in "${REQUIRED_TEMPLATES[@]}"; do
  if [[ ! -f "${DEST_DIR}/${rel}" ]]; then
    echo "error: failed to copy email template: ${DEST_DIR}/${rel}" >&2
    exit 1
  fi
done

echo "==> Copied email templates to ${DEST_DIR}"
