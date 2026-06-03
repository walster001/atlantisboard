#!/usr/bin/env bash
# Uses env bash for PATH portability (project convention).
# Interactive Atlantisboard installer (Linux + whiptail).
set -euo pipefail

ATL_SYSTEMD_INSTALLED=false
ATL_REVERSE_PROXY_KIND=none
INSTALL_DIR=""
BUN_BIN=""
BACKUP_DIR=""

# Resolve package root from env override or script location.
_resolve_pkg_root() {
  if [[ -n "${ATLANTISBOARD_PACKAGE_ROOT:-}" ]]; then
    cd "${ATLANTISBOARD_PACKAGE_ROOT}" && pwd
    return 0
  fi
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "${script_dir}/../package.json" ]]; then
    cd "${script_dir}/.." && pwd
    return 0
  fi
  if [[ -f "${script_dir}/../../package.json" ]]; then
    cd "${script_dir}/../.." && pwd
    return 0
  fi
  printf '%s\n' \
    "atlantisboard-setup: could not locate package root " \
    "(set ATLANTISBOARD_PACKAGE_ROOT)" >&2
  exit 1
}

# Render systemd unit templates with installer substitutions.
atl_render_systemd_unit() {
  local src="$1"
  local dest="$2"
  atl_sudo sed \
    -e "s|@INSTALL_DIR@|${INSTALL_DIR}|g" \
    -e "s|@BUN_BIN@|${BUN_BIN}|g" \
    -e "s|@BACKUP_DIR@|${BACKUP_DIR}|g" \
    "$src" | atl_sudo tee "$dest" >/dev/null
}

# Run the interactive installer flow.
main() {
  readonly PKG_ROOT="$(_resolve_pkg_root)"
  readonly ENV_FIELDS="${PKG_ROOT}/install/env-fields.json"
  export ATLANTISBOARD_PACKAGE_ROOT="$PKG_ROOT"
  INSTALL_DIR="${ATLANTISBOARD_INSTALL_DIR:-/opt/atlantisboard}"

  # shellcheck source=lib/common.sh
  source "${PKG_ROOT}/install/lib/common.sh"
  # shellcheck source=lib/uninstall-lib.sh
  source "${PKG_ROOT}/install/lib/uninstall-lib.sh"

  if ! declare -F info >/dev/null 2>&1; then
    info() {
      printf '%s\n' "$*" >&2
    }
  fi
  if ! declare -F err >/dev/null 2>&1; then
    err() {
      printf '%s\n' "$*" >&2
    }
  fi

  if [[ "$(uname -s)" != "Linux" ]]; then
    err "atlantisboard-setup requires Linux (whiptail)."
    err "On macOS use Docker or manual install."
    err "See docs/wiki/npm-install.md."
    exit 1
  fi

  if ! command -v whiptail >/dev/null 2>&1; then
    if ! atl_bootstrap_whiptail; then
      err "atlantisboard-setup requires whiptail."
      err "Install it and retry:"
      err "  Debian/Ubuntu: sudo apt install whiptail"
      err "  Fedora: sudo dnf install newt"
      exit 1
    fi
  fi

  atl_apply_theme
  atl_require_sudo_access

  local welcome_msg
  welcome_msg="$(cat <<'EOF'
This installer sets up Atlantisboard end to end:

- App and dependencies (Docker or Bun)
- HTTPS reverse proxy (Caddy or Nginx)
- Secrets generated automatically

When it finishes, open the public site URL you enter.

Press OK to start.
EOF
)"
  atl_whiptail_msgbox --title "Welcome to Atlantisboard" --msgbox \
    "$welcome_msg" 16 72 || exit 0

  local install_menu_prompt
  install_menu_prompt="How should Atlantisboard run on this server?"
  MODE="$(atl_whiptail_capture --title "Installation type" --menu \
    "$install_menu_prompt" 18 78 3 \
    "fullstack" \
      "Docker full stack - app, database, Redis, and storage (easiest)" \
    "docker" \
      "Docker dependencies only - app runs on this server with Bun" \
    "manual" \
      "Bring your own MongoDB, Redis, and MinIO")" || exit 1
  MODE="$(atl_sanitize_input "$MODE")"
  case "$MODE" in
    fullstack | docker | manual) ;;
    *)
      local invalid_mode_msg
      invalid_mode_msg="$(cat <<'EOF'
Could not read the selected installation type.

Run atlantisboard-setup from an interactive terminal
(not piped or redirected).
EOF
)"
      atl_whiptail_display --title "Installation type" --msgbox \
        "$invalid_mode_msg" 12 72 || true
      exit 1
      ;;
  esac

  atl_prompt_install_dir "$INSTALL_DIR"
  atl_finalize_install_dir

  declare -A ENV_VALUES
  ENV_VALUES["PORT"]="3000"

  atl_preflight_check "$MODE"
  atl_generate_install_secrets "$MODE"
  atl_prompt_env_fields "$MODE"

  while [[ -n "${ENV_VALUES[GOOGLE_CLIENT_ID]:-}" \
    && -z "${ENV_VALUES[GOOGLE_CLIENT_SECRET]:-}" ]]; do
    local google_secret_msg
    google_secret_msg="$(cat <<'EOF'
You entered a Google OAuth Client ID but no Client Secret.

Both are required for Google sign-in,
or leave both blank to skip.
EOF
)"
    atl_whiptail_display --title "Google sign-in" --msgbox \
      "$google_secret_msg" 12 70 || true
    atl_prompt_validated "GOOGLE_CLIENT_SECRET" \
      "Google OAuth Client Secret" \
      "The secret from Google Cloud Console next to your OAuth client." \
      "" "true" "false" "" || exit 1
  done

  atl_sync_cors_with_app_url
  atl_validate_google_oauth_config
  atl_verify_app_port "$MODE"
  atl_apply_mode_defaults "$MODE"

  if [[ "$MODE" == "manual" ]]; then
    atl_preflight_manual_services
  fi

  INSTALL_USER="$(atl_get_install_user)"
  PRIOR_ENV=""
  ENV_FILE="${INSTALL_DIR}/.env"

  if atl_sudo test -f "$ENV_FILE"; then
    PRIOR_ENV="$(mktemp)"
    atl_sudo cp "$ENV_FILE" "$PRIOR_ENV"
    atl_sudo chmod 644 "$PRIOR_ENV"
  fi

  atl_sudo_mkdir_p "$INSTALL_DIR"
  info "==> Copying package to ${INSTALL_DIR}"
  atl_sudo rsync -a --delete \
    --exclude node_modules \
    --exclude .env \
    "${PKG_ROOT}/" "${INSTALL_DIR}/"

  if atl_sudo test -f "${PKG_ROOT}/.env.example" \
    && ! atl_sudo test -f "$ENV_FILE"; then
    atl_sudo cp "${PKG_ROOT}/.env.example" "$ENV_FILE"
  fi

  atl_write_env_file "$ENV_FILE"

  BUN_BIN=""
  if [[ "$MODE" != "fullstack" ]]; then
    atl_sudo chown -R "${INSTALL_USER}:${INSTALL_USER}" "$INSTALL_DIR"
    BUN_BIN="$(atl_ensure_bun)"

    info "==> Installing production dependencies"
    (
      cd "$INSTALL_DIR"
      atl_sudo -u "$INSTALL_USER" env \
        ATLANTISBOARD_SKIP_SETUP=1 PATH="/usr/local/bin:${PATH}" \
        "$BUN_BIN" install --frozen-lockfile --production --ignore-scripts
    )
  fi

  if [[ "$MODE" == "docker" ]]; then
    atl_warn_docker_volume_desync "$MODE" "$PRIOR_ENV"
    atl_whiptail_display --title "Starting dependencies" --infobox \
      "Starting MongoDB, Redis, and MinIO containers..." 8 60
    atl_docker_compose_or_continue \
      "${INSTALL_DIR}/install/docker" \
      docker-compose.deps.yml up -d
    atl_wait_for_docker_deps_or_continue "$MODE"
  fi

  if [[ "$MODE" == "fullstack" ]]; then
    local fullstack_msg
    atl_warn_docker_volume_desync "$MODE" "$PRIOR_ENV"
    fullstack_msg="$(cat <<'EOF'
Building the Atlantisboard image and starting all containers.

This can take several minutes on first run.
EOF
)"
    atl_whiptail_display --title "Building full stack" --infobox \
      "$fullstack_msg" 10 70
    atl_docker_compose_or_continue \
      "${INSTALL_DIR}/install/docker" \
      docker-compose.fullstack.yml up -d --build
    atl_wait_for_docker_deps_or_continue "$MODE"
  fi

  rm -f "$PRIOR_ENV"

  BACKUP_DIR="$(
    atl_normalize_backup_dir \
      "$(atl_env_get BACKUP_LOCATION /var/backups/atlantisboard)"
  )"
  ENV_VALUES["BACKUP_LOCATION"]="$BACKUP_DIR"
  atl_write_env_file "$ENV_FILE"
  if [[ "$MODE" != "fullstack" ]]; then
    atl_sudo_mkdir_p "$BACKUP_DIR"
  fi

  if [[ "$MODE" != "fullstack" ]]; then
    if atl_require_systemctl; then
      ATL_SYSTEMD_INSTALLED=true
      if ! id atlantisboard >/dev/null 2>&1; then
        atl_sudo useradd --system --create-home \
          --shell /usr/sbin/nologin atlantisboard || true
      fi
      atl_sudo chown -R atlantisboard:atlantisboard \
        "$INSTALL_DIR" "$BACKUP_DIR"

      atl_render_systemd_unit \
        "${INSTALL_DIR}/install/systemd/atlantisboard.service.template" \
        /etc/systemd/system/atlantisboard.service
      if [[ "${ENV_VALUES[ENABLE_CRON_JOBS_IN_MAIN]:-false}" != "true" ]]; then
        local worker_template
        worker_template="${INSTALL_DIR}/install/systemd/"
        worker_template+="atlantisboard-worker.service.template"
        atl_render_systemd_unit \
          "$worker_template" \
          /etc/systemd/system/atlantisboard-worker.service
      fi

      atl_sudo systemctl daemon-reload
      atl_sudo systemctl enable atlantisboard.service
      if [[ "${ENV_VALUES[ENABLE_CRON_JOBS_IN_MAIN]:-false}" != "true" ]]; then
        atl_sudo systemctl enable atlantisboard-worker.service
      fi

      if [[ "$MODE" == "docker" ]]; then
        atl_wait_for_docker_deps_or_continue "$MODE" 30
      fi

      atl_systemctl_restart_or_fail atlantisboard.service
      if [[ "${ENV_VALUES[ENABLE_CRON_JOBS_IN_MAIN]:-false}" != "true" ]]; then
        atl_systemctl_restart_or_fail atlantisboard-worker.service
      fi
    else
      local systemd_skip_msg
      systemd_skip_msg="$(cat <<EOF
systemd is not available on this host.

Start Atlantisboard manually from ${INSTALL_DIR}
after setup completes.
EOF
)"
      atl_whiptail_msgbox --title "systemd skipped" --msgbox \
        "$systemd_skip_msg" 10 72 || true
    fi
  fi

  # shellcheck source=reverse-proxy.sh
  source "${PKG_ROOT}/install/reverse-proxy.sh"
  run_reverse_proxy_wizard

  ENV_VALUES["ATLANTISBOARD_INSTALL_MODE"]="$MODE"
  atl_write_env_file "$ENV_FILE"
  atl_restart_after_config "$MODE" "$INSTALL_DIR"

  worker_installed=false
  if [[ "$ATL_SYSTEMD_INSTALLED" == true \
    && "${ENV_VALUES[ENABLE_CRON_JOBS_IN_MAIN]:-false}" != "true" ]]; then
    worker_installed=true
  fi

  created_user=false
  if [[ "$ATL_SYSTEMD_INSTALLED" == true ]]; then
    created_user=true
  fi

  atl_write_install_manifest \
    "$MODE" \
    "$INSTALL_DIR" \
    "$ENV_FILE" \
    "$BACKUP_DIR" \
    "$ATL_SYSTEMD_INSTALLED" \
    "$worker_installed" \
    "$ATL_REVERSE_PROXY_KIND" \
    "$created_user" \
    "$PKG_ROOT"

  PUBLIC_URL="$(atl_env_get_from_file APP_URL "$ENV_FILE" 2>/dev/null || true)"
  if [[ -z "$PUBLIC_URL" ]]; then
    PUBLIC_URL="(APP_URL is not set in ${ENV_FILE})"
  fi

  local complete_msg
  complete_msg="$(cat <<EOF
Atlantisboard is ready.

Sign in at:
${PUBLIC_URL}

Install directory:
${INSTALL_DIR}

If the page does not load yet, wait a minute for TLS certificates (Caddy)
or check that DNS points to this server.
EOF
)"
  atl_whiptail_msgbox --title "Installation complete" --msgbox \
    "$complete_msg" 16 72 || true
}

main "$@"
