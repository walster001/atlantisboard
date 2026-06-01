#!/usr/bin/env bash
# Interactive Atlantisboard installer (Linux + whiptail).
set -euo pipefail

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
  echo "atlantisboard-setup: could not locate package root (set ATLANTISBOARD_PACKAGE_ROOT)" >&2
  exit 1
}
PKG_ROOT="$(_resolve_pkg_root)"
export ATLANTISBOARD_PACKAGE_ROOT="$PKG_ROOT"
ENV_FIELDS="${PKG_ROOT}/install/env-fields.json"
INSTALL_DIR="${ATLANTISBOARD_INSTALL_DIR:-/opt/atlantisboard}"

# shellcheck source=lib/common.sh
source "${PKG_ROOT}/install/lib/common.sh"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "atlantisboard-setup requires Linux (whiptail). On macOS use Docker or manual install — see docs/wiki/npm-install.md"
  exit 1
fi

if ! command -v whiptail >/dev/null 2>&1; then
  echo "atlantisboard-setup requires whiptail. Install whiptail (Debian/Ubuntu: sudo apt install whiptail) and retry."
  exit 1
fi

atl_apply_theme

atl_require_sudo_access

atl_whiptail_display --title "Welcome to Atlantisboard" --msgbox \
  "This wizard will guide you through installing Atlantisboard.\n\n• Secrets are generated automatically\n• Each step validates your input\n• You can add Google sign-in later if you skip it\n\nPress OK to continue." \
  14 72 || exit 0

MODE="$(atl_whiptail_capture --title "Installation type" --menu \
  "How should Atlantisboard run on this server?" 18 78 3 \
  "fullstack" "Docker full stack — app, database, Redis, and storage (easiest)" \
  "docker" "Docker dependencies only — app runs on this server with Bun" \
  "manual" "Bring your own MongoDB, Redis, and MinIO")" || exit 1
MODE="$(atl_sanitize_input "$MODE")"
case "$MODE" in
  fullstack | docker | manual) ;;
  *)
    atl_whiptail_display --title "Installation type" --msgbox \
      "Could not read the selected installation type.\n\nRun atlantisboard-setup from an interactive terminal (not piped or redirected)." \
      12 72 || true
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

# Google OAuth: if Client ID set, secret is required.
while [[ -n "${ENV_VALUES[GOOGLE_CLIENT_ID]:-}" && -z "${ENV_VALUES[GOOGLE_CLIENT_SECRET]:-}" ]]; do
  atl_whiptail_display --title "Google sign-in" --msgbox \
    "You entered a Google OAuth Client ID but no Client Secret.\n\nBoth are required for Google sign-in, or leave both blank to skip." \
    12 70 || true
  atl_prompt_validated "GOOGLE_CLIENT_SECRET" \
    "Google OAuth Client Secret" \
    "The secret from Google Cloud Console next to your OAuth client." \
    "" "true" "false" "" || exit 1
done

atl_apply_mode_defaults "$MODE"

INSTALL_USER="$(atl_get_install_user)"
PRIOR_ENV=""
ENV_FILE="${INSTALL_DIR}/.env"

if atl_sudo test -f "$ENV_FILE"; then
  PRIOR_ENV="$(mktemp)"
  atl_sudo cp "$ENV_FILE" "$PRIOR_ENV"
  atl_sudo chmod 644 "$PRIOR_ENV"
fi

atl_sudo_mkdir_p "$INSTALL_DIR"
echo "==> Copying package to ${INSTALL_DIR}"
atl_sudo rsync -a --delete \
  --exclude node_modules \
  "${PKG_ROOT}/" "${INSTALL_DIR}/"

if atl_sudo test -f "${PKG_ROOT}/.env.example" && ! atl_sudo test -f "$ENV_FILE"; then
  atl_sudo cp "${PKG_ROOT}/.env.example" "$ENV_FILE"
fi

atl_write_env_file "$ENV_FILE"

BUN_BIN=""
if [[ "$MODE" != "fullstack" ]]; then
  atl_sudo chown -R "${INSTALL_USER}:${INSTALL_USER}" "$INSTALL_DIR"
  BUN_BIN="$(atl_ensure_bun)"

  echo "==> Installing production dependencies"
  (cd "$INSTALL_DIR" && atl_sudo -u "$INSTALL_USER" env PATH="/usr/local/bin:${PATH}" "$BUN_BIN" install --frozen-lockfile --production)
fi

if [[ "$MODE" == "docker" ]]; then
  atl_warn_docker_volume_desync "$MODE" "$PRIOR_ENV"
  atl_whiptail_display --title "Starting dependencies" --infobox "Starting MongoDB, Redis, and MinIO containers..." 8 60
  atl_docker_compose "${INSTALL_DIR}/install/docker" docker-compose.deps.yml up -d
  atl_wait_for_docker_deps "$MODE"
fi

if [[ "$MODE" == "fullstack" ]]; then
  atl_warn_docker_volume_desync "$MODE" "$PRIOR_ENV"
  atl_whiptail_display --title "Building full stack" --infobox \
    "Building the Atlantisboard image and starting all containers.\n\nThis can take several minutes on first run." \
    10 70
  atl_docker_compose "${INSTALL_DIR}/install/docker" docker-compose.fullstack.yml up -d --build
  atl_wait_for_docker_deps "$MODE"
  atl_whiptail_display --title "Full stack started" --msgbox \
    "All services are running in Docker.\n\n• App: port ${ENV_VALUES[PORT]:-3000}\n• MongoDB, Redis, and MinIO are ready\n\nUse: docker compose -f ${INSTALL_DIR}/install/docker/docker-compose.fullstack.yml ps" \
    14 72 || true
fi

rm -f "$PRIOR_ENV"

BACKUP_DIR="$(atl_normalize_backup_dir "$(atl_env_get BACKUP_LOCATION /var/backups/atlantisboard)")"
ENV_VALUES["BACKUP_LOCATION"]="$BACKUP_DIR"
atl_write_env_file "$ENV_FILE"
if [[ "$MODE" != "fullstack" ]]; then
  atl_sudo_mkdir_p "$BACKUP_DIR"
fi

if [[ "$MODE" != "fullstack" ]] && atl_whiptail_display --title "systemd services" --yesno \
  "Install systemd services so Atlantisboard starts automatically on boot?" 10 72; then
  if atl_require_systemctl; then
    if ! id atlantisboard >/dev/null 2>&1; then
      atl_sudo useradd --system --create-home --shell /usr/sbin/nologin atlantisboard || true
    fi
    atl_sudo chown -R atlantisboard:atlantisboard "$INSTALL_DIR" "$BACKUP_DIR"

    render_unit() {
      local src="$1" dest="$2"
      atl_sudo sed \
        -e "s|@INSTALL_DIR@|${INSTALL_DIR}|g" \
        -e "s|@BUN_BIN@|${BUN_BIN}|g" \
        -e "s|@BACKUP_DIR@|${BACKUP_DIR}|g" \
        "$src" | atl_sudo tee "$dest" >/dev/null
    }

    render_unit "${PKG_ROOT}/install/systemd/atlantisboard.service.template" /etc/systemd/system/atlantisboard.service
    if [[ "${ENV_VALUES[ENABLE_CRON_JOBS_IN_MAIN]:-false}" != "true" ]]; then
      render_unit "${PKG_ROOT}/install/systemd/atlantisboard-worker.service.template" /etc/systemd/system/atlantisboard-worker.service
    fi

    atl_sudo systemctl daemon-reload
    atl_sudo systemctl enable atlantisboard.service
    [[ "${ENV_VALUES[ENABLE_CRON_JOBS_IN_MAIN]:-false}" != "true" ]] && atl_sudo systemctl enable atlantisboard-worker.service

    if [[ "$MODE" == "docker" ]]; then
      atl_wait_for_docker_deps "$MODE" 30
    fi

    atl_systemctl_restart_or_fail atlantisboard.service
    if [[ "${ENV_VALUES[ENABLE_CRON_JOBS_IN_MAIN]:-false}" != "true" ]]; then
      atl_systemctl_restart_or_fail atlantisboard-worker.service
    fi
  fi
fi

# shellcheck source=reverse-proxy.sh
source "${PKG_ROOT}/install/reverse-proxy.sh"
run_reverse_proxy_wizard

atl_write_env_file "$ENV_FILE"

if [[ "$MODE" == "fullstack" ]]; then
  atl_docker_compose "${INSTALL_DIR}/install/docker" docker-compose.fullstack.yml up -d
fi

PUBLIC_URL="$(atl_env_get APP_URL http://localhost:3000)"
case "$MODE" in
  fullstack)
    atl_whiptail_display --title "Installation complete" --msgbox \
      "Atlantisboard full stack is running in Docker.\n\nOpen: ${PUBLIC_URL}\nInstall dir: ${INSTALL_DIR}\n\nManage: cd ${INSTALL_DIR}/install/docker && docker compose -f docker-compose.fullstack.yml ps\n\nSee docs/wiki/npm-install.md" \
      16 72
    ;;
  *)
    atl_whiptail_display --title "Installation complete" --msgbox \
      "Installation finished.\n\nOpen: ${PUBLIC_URL}\nInstall dir: ${INSTALL_DIR}\n\nSee DEPLOYMENT.md and docs/wiki/npm-install.md" \
      14 72
    ;;
esac
