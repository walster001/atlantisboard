#!/usr/bin/env bash
# Non-interactive harness for packages/atlantisboard/install/lib/common.sh
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${HARNESS_DIR}/../.." && pwd)"
PKG_ROOT="${ATLANTISBOARD_PACKAGE_ROOT:-${REPO_ROOT}/packages/atlantisboard}"
MOCK_BIN="${HARNESS_DIR}/fixtures/bin"

export PATH="${MOCK_BIN}:${PATH}"
export ATLANTISBOARD_PACKAGE_ROOT="$PKG_ROOT"

fail() {
  echo "installer-lib.harness: $*" >&2
  exit 1
}

[[ -f "${PKG_ROOT}/package.json" ]] || fail "missing package.json under ${PKG_ROOT}"
[[ -f "${PKG_ROOT}/install/lib/common.sh" ]] || fail "missing install/lib/common.sh"
[[ -f "${PKG_ROOT}/install/env-fields.json" ]] || fail "missing env-fields.json"

declare -A ENV_VALUES
INSTALL_DIR="/opt/atlantisboard"
ENV_FIELDS="${PKG_ROOT}/install/env-fields.json"

# shellcheck source=../../packages/atlantisboard/install/lib/common.sh
source "${PKG_ROOT}/install/lib/common.sh"

# Avoid sudo / interactive dialogs in harness.
atl_sudo() {
  local cmd="$1"
  shift
  case "$cmd" in
    install)
      local src="${@: -2:1}" dest="${@: -1}"
      install -m 600 "$src" "$dest"
      ;;
    test)
      test "$@"
      ;;
    cat)
      cat "$@"
      ;;
    mkdir)
      mkdir "$@"
      ;;
    *)
      "$cmd" "$@"
      ;;
  esac
}

atl_whiptail_display() {
  :
}

assert_path_rejects_garbled() {
  local garbled='docker/opt/atlantisboardproduction30000.0.0.0http://baseimage.atlantis.socialhttp://localhost:3000secretmongodb://localhost:27017/kanboard?replicaSet=rs0kanboardlocalhost6379ATLWEKANfalsefalse/var/backups/atlantisboard'
  if atl_path_is_safe_absolute "$garbled"; then
    fail "garbled installer blob must not pass path validation"
  fi
  if atl_validate_value "$garbled" "path_absolute" "false"; then
    fail "garbled blob must not pass path_absolute validation"
  fi
}

assert_path_accepts_valid() {
  atl_path_is_safe_absolute "/opt/atlantisboard" || fail "expected /opt/atlantisboard"
  atl_path_is_safe_absolute "/var/backups/atlantisboard" || fail "expected backup path"
  atl_validate_value "/opt/atlantisboard" "install_dir" "false" || fail "install_dir validation"
}

assert_backup_dir_defaults() {
  local normalized
  normalized="$(atl_normalize_backup_dir "")"
  [[ "$normalized" == "/var/backups/atlantisboard" ]] || fail "normalize empty -> default"
  normalized="$(atl_normalize_backup_dir "  ")"
  [[ "$normalized" == "/var/backups/atlantisboard" ]] || fail "normalize whitespace -> default"
}

assert_env_get_empty_coalesce() {
  ENV_VALUES["BACKUP_LOCATION"]=""
  local value
  value="$(atl_env_get BACKUP_LOCATION /var/backups/atlantisboard)"
  [[ "$value" == "/var/backups/atlantisboard" ]] || fail "atl_env_get should treat empty as unset"
}

assert_whiptail_capture_isolated() {
  export WHIPTAIL_MOCK_EXIT_CODE=0
  export WHIPTAIL_MOCK_VALUE=fullstack
  local first
  first="$(atl_whiptail_capture --title "mode" --menu "choose" 12 60 2 \
    "fullstack" "Full" \
    "docker" "Docker")"
  [[ "$first" == "fullstack" ]] || fail "first capture expected fullstack, got [${first}]"

  export WHIPTAIL_MOCK_VALUE=docker
  local second
  second="$(atl_whiptail_capture --title "mode" --menu "choose" 12 60 2 \
    "fullstack" "Full" \
    "docker" "Docker")"
  [[ "$second" == "docker" ]] || fail "second capture expected docker, got [${second}]"
  [[ "$first" != "$second" ]] || fail "captures must not accumulate prior answers"

  export WHIPTAIL_MOCK_VALUE=/opt/atlantisboard
  local install_path
  install_path="$(atl_whiptail_capture --title "Install" --inputbox "path" 12 70 "/opt/atlantisboard")"
  [[ "$install_path" == "/opt/atlantisboard" ]] || fail "inputbox capture got [${install_path}]"

  export WHIPTAIL_MOCK_EXIT_CODE=1
  if atl_whiptail_capture --title "x" --menu "m" 8 40 1 a A; then
    fail "expected cancel to fail capture"
  fi
  export WHIPTAIL_MOCK_EXIT_CODE=0
}

assert_write_env_file_format() {
  local tmpdir env_file line_count key_count
  tmpdir="$(mktemp -d)"
  env_file="${tmpdir}/.env"
  ENV_VALUES=()
  ENV_VALUES["JWT_SECRET"]="test-jwt-secret-value"
  ENV_VALUES["PORT"]="3000"
  ENV_VALUES["BACKUP_LOCATION"]="/var/backups/atlantisboard"
  ENV_VALUES["APP_URL"]="http://localhost:3000"
  atl_write_env_file "$env_file"

  [[ -f "$env_file" ]] || fail "env file not written"
  if grep -q $'docker/opt/atlantisboard' "$env_file"; then
    fail "env file must not contain concatenated path blob"
  fi
  line_count="$(grep -c '^[A-Za-z_][A-Za-z0-9_]*=' "$env_file" || true)"
  if (( line_count < 4 )); then
    fail "env file should have multiple KEY= lines, got ${line_count}"
  fi
  if ! grep -q '^BACKUP_LOCATION=/var/backups/atlantisboard$' "$env_file"; then
    fail "BACKUP_LOCATION line missing or wrong"
  fi
  if grep -q $'=' <<<"$(tr -d '\n' <"$env_file")" && [[ "$(wc -l <"$env_file")" -lt 2 ]]; then
    fail "env file appears to be a single line (missing newlines)"
  fi
  rm -rf "$tmpdir"
}

assert_mkdir_rejects_empty() {
  if atl_sudo_mkdir_p ""; then
    fail "mkdir should reject empty directory"
  fi
}

assert_path_rejects_garbled
assert_path_accepts_valid
assert_backup_dir_defaults
assert_env_get_empty_coalesce
assert_whiptail_capture_isolated
assert_write_env_file_format
assert_mkdir_rejects_empty

echo "installer-lib.harness: all checks passed"
