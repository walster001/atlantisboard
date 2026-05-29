#!/usr/bin/env bash
# Interactive Atlantisboard installer (Linux + whiptail).
set -euo pipefail

_resolve_pkg_root() {
  local dir
  dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "${dir}/../package.json" ]]; then
    cd "${dir}/.." && pwd
  else
    cd "${dir}/../.." && pwd
  fi
}
PKG_ROOT="${ATLANTISBOARD_PACKAGE_ROOT:-$(_resolve_pkg_root)}"
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

whiptail --title "Welcome to Atlantisboard" --msgbox \
  "This wizard will guide you through installing Atlantisboard.\n\n• Secrets are generated automatically\n• Each step validates your input\n• You can add Google sign-in later if you skip it\n\nPress OK to continue." \
  14 72 || exit 0

MODE="$(whiptail --title "Installation type" --menu \
  "How should Atlantisboard run on this server?" 18 78 3 \
  "fullstack" "Docker full stack — app, database, Redis, and storage (easiest)" \
  "docker" "Docker dependencies only — app runs on this server with Bun" \
  "manual" "Bring your own MongoDB, Redis, and MinIO" \
  3>&2 1>&2)" || exit 1

atl_prompt_install_dir "$INSTALL_DIR"

declare -A ENV_VALUES
ENV_VALUES["PORT"]="3000"

atl_preflight_check "$MODE"

whiptail --title "Generating secrets" --infobox "Creating secure random passwords and signing keys...\n\nPlease wait." 8 60
atl_auto_generate_secrets "$MODE"
sleep 1

atl_prompt_env_fields "$MODE"

# Google OAuth: if Client ID set, secret is required.
while [[ -n "${ENV_VALUES[GOOGLE_CLIENT_ID]:-}" && -z "${ENV_VALUES[GOOGLE_CLIENT_SECRET]:-}" ]]; do
  whiptail --title "Google sign-in" --msgbox \
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

if [[ -f "$ENV_FILE" ]]; then
  PRIOR_ENV="$(mktemp)"
  sudo cp "$ENV_FILE" "$PRIOR_ENV"
  sudo chmod 644 "$PRIOR_ENV"
fi

sudo mkdir -p "$INSTALL_DIR"
echo "==> Copying package to ${INSTALL_DIR}"
sudo rsync -a --delete \
  --exclude node_modules \
  "${PKG_ROOT}/" "${INSTALL_DIR}/"

if [[ -f "${PKG_ROOT}/.env.example" && ! -f "$ENV_FILE" ]]; then
  sudo cp "${PKG_ROOT}/.env.example" "$ENV_FILE"
fi

atl_write_env_file "$ENV_FILE"

BUN_BIN=""
if [[ "$MODE" != "fullstack" ]]; then
  sudo chown -R "${INSTALL_USER}:${INSTALL_USER}" "$INSTALL_DIR"
  BUN_BIN="$(atl_ensure_bun)"

  echo "==> Installing production dependencies"
  (cd "$INSTALL_DIR" && sudo -u "$INSTALL_USER" env PATH="/usr/local/bin:${PATH}" "$BUN_BIN" install --frozen-lockfile --production)
fi

if [[ "$MODE" == "docker" ]]; then
  atl_warn_docker_volume_desync "$MODE" "$PRIOR_ENV"
  whiptail --title "Starting dependencies" --infobox "Starting MongoDB, Redis, and MinIO containers..." 8 60
  atl_docker_compose "${INSTALL_DIR}/install/docker" docker-compose.deps.yml up -d
  atl_wait_for_docker_deps "$MODE"
fi

if [[ "$MODE" == "fullstack" ]]; then
  atl_warn_docker_volume_desync "$MODE" "$PRIOR_ENV"
  whiptail --title "Building full stack" --infobox \
    "Building the Atlantisboard image and starting all containers.\n\nThis can take several minutes on first run." \
    10 70
  atl_docker_compose "${INSTALL_DIR}/install/docker" docker-compose.fullstack.yml up -d --build
  atl_wait_for_docker_deps "$MODE"
  whiptail --title "Full stack started" --msgbox \
    "All services are running in Docker.\n\n• App: port ${ENV_VALUES[PORT]:-3000}\n• MongoDB, Redis, and MinIO are ready\n\nUse: docker compose -f ${INSTALL_DIR}/install/docker/docker-compose.fullstack.yml ps" \
    14 72 || true
fi

rm -f "$PRIOR_ENV"

BACKUP_DIR="${ENV_VALUES[BACKUP_LOCATION]:-/var/backups/atlantisboard}"
if [[ "$MODE" != "fullstack" ]]; then
  sudo mkdir -p "$BACKUP_DIR"
fi

if [[ "$MODE" != "fullstack" ]] && whiptail --title "systemd services" --yesno \
  "Install systemd services so Atlantisboard starts automatically on boot?" 10 72; then
  if atl_require_systemctl; then
    if ! id atlantisboard >/dev/null 2>&1; then
      sudo useradd --system --create-home --shell /usr/sbin/nologin atlantisboard || true
    fi
    sudo chown -R atlantisboard:atlantisboard "$INSTALL_DIR" "$BACKUP_DIR"

    render_unit() {
      local src="$1" dest="$2"
      sudo sed \
        -e "s|@INSTALL_DIR@|${INSTALL_DIR}|g" \
        -e "s|@BUN_BIN@|${BUN_BIN}|g" \
        -e "s|@BACKUP_DIR@|${BACKUP_DIR}|g" \
        "$src" | sudo tee "$dest" >/dev/null
    }

    render_unit "${PKG_ROOT}/install/systemd/atlantisboard.service.template" /etc/systemd/system/atlantisboard.service
    if [[ "${ENV_VALUES[ENABLE_CRON_JOBS_IN_MAIN]:-false}" != "true" ]]; then
      render_unit "${PKG_ROOT}/install/systemd/atlantisboard-worker.service.template" /etc/systemd/system/atlantisboard-worker.service
    fi

    sudo systemctl daemon-reload
    sudo systemctl enable atlantisboard.service
    [[ "${ENV_VALUES[ENABLE_CRON_JOBS_IN_MAIN]:-false}" != "true" ]] && sudo systemctl enable atlantisboard-worker.service

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

if [[ "$MODE" == "fullstack" ]]; then
  atl_write_env_file "$ENV_FILE"
  atl_docker_compose "${INSTALL_DIR}/install/docker" docker-compose.fullstack.yml up -d
fi

PUBLIC_URL="${ENV_VALUES[APP_URL]:-http://localhost:3000}"
case "$MODE" in
  fullstack)
    whiptail --title "Installation complete" --msgbox \
      "Atlantisboard full stack is running in Docker.\n\nOpen: ${PUBLIC_URL}\nInstall dir: ${INSTALL_DIR}\n\nManage: cd ${INSTALL_DIR}/install/docker && docker compose -f docker-compose.fullstack.yml ps\n\nSee docs/wiki/npm-install.md" \
      16 72
    ;;
  *)
    whiptail --title "Installation complete" --msgbox \
      "Installation finished.\n\nOpen: ${PUBLIC_URL}\nInstall dir: ${INSTALL_DIR}\n\nSee DEPLOYMENT.md and docs/wiki/npm-install.md" \
      14 72
    ;;
esac
