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

REQUIRED_EMAIL_TEMPLATES=(
  src/server/emails/test.handlebars
  src/server/emails/password-reset.handlebars
  src/server/emails/verify-email.handlebars
  src/server/emails/board-activity-roundup.handlebars
  src/server/emails/layouts/main.handlebars
)
for rel in "${REQUIRED_EMAIL_TEMPLATES[@]}"; do
  if [[ ! -f "${PKG}/${rel}" ]]; then
    echo "error: ${PKG}/${rel} missing — run build-npm-package.sh (copy-release-email-templates.sh)" >&2
    exit 1
  fi
done

if [[ ! -s "${PKG}/public/legal/privacy-policy.md" ]]; then
  echo "error: ${PKG}/public/legal/privacy-policy.md missing — run build-npm-package.sh (copy-privacy-policy.sh)" >&2
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

echo "==> Assert production image includes email templates"
docker run --rm --entrypoint sh "${prod_id}" -c '
  set -e
  for f in \
    /app/src/server/emails/test.handlebars \
    /app/src/server/emails/password-reset.handlebars \
    /app/src/server/emails/verify-email.handlebars \
    /app/src/server/emails/board-activity-roundup.handlebars \
    /app/src/server/emails/layouts/main.handlebars
  do
    test -f "$f" || { echo "missing email template: $f" >&2; exit 1; }
  done
'

echo "==> Assert production image includes bundled privacy policy"
docker run --rm --entrypoint sh "${prod_id}" -c '
  test -s /app/public/legal/privacy-policy.md \
    || { echo "missing privacy policy: /app/public/legal/privacy-policy.md" >&2; exit 1; }
'

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
