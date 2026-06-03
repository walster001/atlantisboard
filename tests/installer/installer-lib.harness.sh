#!/usr/bin/env bash
# Non-interactive harness for packages/atlantisboard/install/lib/common.sh
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${HARNESS_DIR}/../.." && pwd)"
PKG_ROOT="${ATLANTISBOARD_PACKAGE_ROOT:-${REPO_ROOT}/packages/atlantisboard}"
MOCK_BIN="${HARNESS_DIR}/fixtures/bin"

export PATH="${MOCK_BIN}:${PATH}"
export ATLANTISBOARD_PACKAGE_ROOT="$PKG_ROOT"
export ATLANTISBOARD_SKIP_PKG_INSTALL=1

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
# shellcheck source=../../packages/atlantisboard/install/lib/uninstall-lib.sh
source "${PKG_ROOT}/install/lib/uninstall-lib.sh"

# Avoid sudo / interactive dialogs in harness.
atl_sudo() {
  local cmd="$1"
  shift
  case "$cmd" in
    install)
      local src dest
      while [[ $# -gt 0 ]]; do
        case "$1" in
          -m | -o | -g) shift 2 ;;
          -*) shift ;;
          *)
            break
            ;;
        esac
      done
      src="${1:-}"
      dest="${2:-}"
      [[ -n "$src" && -n "$dest" ]] || return 1
      install -m 600 "$src" "$dest"
      ;;
    test)
      test "$@"
      ;;
    cat)
      cat "$@"
      ;;
    grep)
      grep "$@"
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
  return 0
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
  return 0
}

assert_prereq_package_mapping() {
  local pm pkgs
  pm="$(atl_detect_pkg_manager)" || pm=apt
  pkgs="$(atl_prereq_packages_for_cmd whiptail apt)"
  [[ "$pkgs" == "whiptail" ]] || fail "apt whiptail mapping expected whiptail, got [${pkgs}]"
  pkgs="$(atl_prereq_packages_for_cmd whiptail dnf)"
  [[ "$pkgs" == "newt" ]] || fail "dnf whiptail mapping expected newt, got [${pkgs}]"
  pkg_line="$(atl_prereq_packages_for_cmd docker-engine apt)"
  [[ "$pkg_line" == "docker.io" ]] || fail "apt docker-engine mapping expected docker.io, got [${pkg_line}]"
  pkg_line="$(atl_prereq_packages_for_cmd docker-compose-plugin apt)"
  [[ "$pkg_line" == "docker-compose-v2" ]] || fail "apt compose mapping expected docker-compose-v2, got [${pkg_line}]"
  return 0
}

assert_welcome_secrets_section_skipped_in_prompts() {
  [[ -f "$ENV_FIELDS" ]] && command -v jq >/dev/null 2>&1 || return 0
  local section
  section="$(jq -c '.sections[] | select(.id == "welcome_secrets")' "$ENV_FIELDS")"
  [[ -n "$section" ]] || fail "welcome_secrets section missing"
  atl_section_prompt_enabled "$section" || fail "welcome_secrets must have prompt: false"
  if atl_section_has_promptable_fields "$section" docker; then
    fail "welcome_secrets must not have promptable fields"
  fi
}

assert_uninstall_scripts_present() {
  [[ -x "${PKG_ROOT}/install/uninstall.sh" ]] || fail "missing install/uninstall.sh"
  [[ -x "${PKG_ROOT}/atlantisboard-uninstall" ]] || fail "missing atlantisboard-uninstall launcher"
  [[ -f "${PKG_ROOT}/install/lib/uninstall-lib.sh" ]] || fail "missing uninstall-lib.sh"
  return 0
}

assert_uninstall_docker_inventory() {
  local names
  names="$(atl_uninstall_collect_docker_containers fullstack)"
  grep -qx 'atlantisboard-app-full' <<<"$names" || fail "fullstack missing app container name"
  names="$(atl_uninstall_collect_docker_containers docker)"
  grep -qx 'atlantisboard-mongodb-deps' <<<"$names" || fail "docker deps missing mongodb container name"
  return 0
}

assert_uninstall_tracked_paths() {
  local paths
  paths="$(atl_uninstall_collect_tracked_paths /opt/atlantisboard /var/backups/atlantisboard fullstack nginx)"
  grep -qx '/opt/atlantisboard' <<<"$paths" || fail "tracked paths must include install dir"
  grep -qx '/etc/nginx/sites-available/atlantisboard' <<<"$paths" || fail "tracked paths must include nginx site"
  return 0
}

assert_env_get_from_file_reads_disk() {
  local tmp env_val
  tmp="$(mktemp -d)"
  printf '%s\n' 'APP_URL=https://boards.example.com' 'PORT=3000' >"${tmp}/.env"
  if ! env_val="$(atl_env_get_from_file APP_URL "${tmp}/.env")"; then
    fail "read APP_URL from file (see ${tmp}/.env)"
  fi
  [[ "$env_val" == "https://boards.example.com" ]] || fail "APP_URL mismatch: [${env_val}]"
  if ! atl_env_get_from_file MISSING_KEY "${tmp}/.env" 2>/dev/null; then
    :
  else
    fail "expected missing key to fail read"
  fi
  rm -rf "$tmp"
  return 0
}

assert_app_url_local_detection() {
  atl_app_url_is_local 'http://localhost:3000' || fail 'localhost should be local'
  atl_app_url_is_local 'https://boards.example.com' && fail 'public domain should not be local'
  domain="$(atl_extract_domain_from_url 'https://boards.example.com')"
  [[ "$domain" == "boards.example.com" ]] || fail "domain extract got ${domain}"
  return 0
}

assert_install_manifest_write() {
  command -v jq >/dev/null 2>&1 || return 0
  local tmp manifest
  tmp="$(mktemp -d)"
  manifest="${tmp}/${ATL_MANIFEST_NAME}"
  atl_write_install_manifest docker "$tmp" "${tmp}/.env" /var/backups/atlantisboard true false nginx true "$PKG_ROOT"
  [[ -f "$manifest" ]] || fail "manifest not written"
  [[ "$(jq -r '.mode' "$manifest")" == "docker" ]] || fail "manifest mode"
  [[ "$(jq -r '.reverse_proxy' "$manifest")" == "nginx" ]] || fail "manifest reverse_proxy"
  rm -rf "$tmp"
  return 0
}

assert_path_rejects_garbled
assert_path_accepts_valid
assert_backup_dir_defaults
assert_env_get_empty_coalesce
assert_whiptail_capture_isolated
assert_write_env_file_format
assert_mkdir_rejects_empty
assert_prereq_package_mapping
assert_welcome_secrets_section_skipped_in_prompts
assert_uninstall_scripts_present
assert_uninstall_docker_inventory
assert_uninstall_tracked_paths
assert_env_get_from_file_reads_disk
assert_app_url_local_detection
assert_install_manifest_write

echo "installer-lib.harness: all checks passed"
