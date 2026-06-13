#!/usr/bin/env bash
# Dry-run checks for non-interactive upgrade helpers.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_DIR="$(mktemp -d)"
trap 'rm -rf "$INSTALL_DIR"' EXIT

fail() {
  echo "test-noninteractive-setup: $*" >&2
  exit 1
}

mkdir -p "$INSTALL_DIR/dist/server" "$INSTALL_DIR/install"
cp "$PKG_ROOT/dist/server/index.js" "$INSTALL_DIR/dist/server/" 2>/dev/null \
  || printf '%s\n' '// stub' >"$INSTALL_DIR/dist/server/index.js"
cp "$PKG_ROOT/install/setup.sh" "$INSTALL_DIR/install/setup.sh"
cp "$PKG_ROOT/package.json" "$INSTALL_DIR/package.json"
touch "$INSTALL_DIR/atlantisboard-setup"
cat >"$INSTALL_DIR/.env" <<EOF
ATLANTISBOARD_INSTALL_MODE=fullstack
APP_URL=https://example.test
PORT=3000
MONGODB_ROOT_USER=root
MONGODB_ROOT_PASSWORD=passwordpasswordpassword
REDIS_PASSWORD=passwordpasswordpassword
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=passwordpasswordpassword
SESSION_SECRET=passwordpasswordpasswordpasswordpasswordpa
JWT_SECRET=passwordpasswordpasswordpasswordpasswordpa
CSRF_SECRET=passwordpasswordpasswordpasswordpasswordpa
ENCRYPTION_KEY=passwordpasswordpasswordpasswordpasswordpa
MEDIA_SIGN_SECRET=passwordpasswordpasswordpasswordpassw
EOF

export PKG_ROOT
readonly ENV_FIELDS="${PKG_ROOT}/install/env-fields.json"
# shellcheck source=lib/common.sh
source "${PKG_ROOT}/install/lib/common.sh"

atl_sudo() {
  "$@"
}

export ATL_NONINTERACTIVE=1
export INSTALL_ACTION=update

atl_init_noninteractive_upgrade "$INSTALL_DIR" \
  || fail "expected fullstack update init to succeed"

[[ "$MODE" == "fullstack" ]] || fail "MODE should be fullstack"
[[ "$INSTALL_ACTION" == "update" ]] || fail "INSTALL_ACTION should be update"

export INSTALL_ACTION=repair
atl_init_noninteractive_upgrade "$INSTALL_DIR" \
  || fail "expected repair init to succeed"

export INSTALL_ACTION=fresh
if atl_init_noninteractive_upgrade "$INSTALL_DIR"; then
  fail "invalid action should be rejected"
fi

echo "test-noninteractive-setup: all checks passed"
