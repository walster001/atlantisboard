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

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    whiptail --title "Missing prerequisite" --msgbox "Required command not found: $1" 10 60
    exit 1
  fi
}

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "atlantisboard-setup requires Linux (whiptail). On macOS use Docker or manual install — see docs/wiki/npm-install.md"
  exit 1
fi

require_cmd whiptail
require_cmd openssl

if ! command -v bun >/dev/null 2>&1; then
  if whiptail --title "Install Bun?" --yesno "Bun is required but not found. Install via official script now?" 10 70; then
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
  fi
fi
require_cmd bun

BUN_BIN="$(command -v bun)"

MODE="$(whiptail --title "Install mode" --menu "Choose how to run dependencies" 14 70 2 \
  "docker" "Docker Compose: MongoDB, Redis, MinIO" \
  "manual" "Use existing MongoDB / Redis / MinIO" 3>&2 1>&2)" || exit 1

INSTALL_DIR="$(whiptail --inputbox "Install directory" 10 70 "$INSTALL_DIR" 3>&2 1>&2)" || exit 1
INSTALL_DIR="${INSTALL_DIR%/}"

declare -A ENV_VALUES

generate_secret() {
  openssl rand -base64 48 | tr -d '\n'
}

prompt_field() {
  local key="$1" label="$2" desc="$3" default="$4" secret="$5" gen="$6"
  local current="${ENV_VALUES[$key]:-$default}"
  local prompt_text="${label}\n\n${desc}"
  if [[ "$secret" == "true" ]]; then
    if [[ -z "$current" && -n "$gen" ]]; then
      current="$(generate_secret)"
    fi
    current="$(whiptail --passwordbox "$prompt_text" 12 70 "$current" 3>&2 1>&2)" || return 1
  else
    current="$(whiptail --inputbox "$prompt_text" 12 70 "$current" 3>&2 1>&2)" || return 1
  fi
  ENV_VALUES["$key"]="$current"
}

if [[ -f "$ENV_FIELDS" ]] && command -v jq >/dev/null 2>&1; then
  while IFS= read -r section; do
    title="$(jq -r '.title' <<<"$section")"
    whiptail --title "$title" --msgbox "Configure ${title} settings in the next dialogs." 8 60 || true
    mapfile -t fields < <(jq -c '.fields[]' <<<"$section")
    for field in "${fields[@]}"; do
      key="$(jq -r '.key' <<<"$field")"
      label="$(jq -r '.label' <<<"$field")"
      desc="$(jq -r '.description' <<<"$field")"
      default="$(jq -r '.default' <<<"$field")"
      secret="$(jq -r '.secret' <<<"$field")"
      gen="$(jq -r '.generate // empty' <<<"$field")"
      prompt_field "$key" "$label" "$desc" "$default" "$secret" "$gen" || exit 1
    done
  done < <(jq -c '.sections[]' "$ENV_FIELDS")
else
  whiptail --title "Setup" --msgbox "jq not found; writing minimal .env from template only." 8 60
fi

if [[ "$MODE" == "docker" ]]; then
  ENV_VALUES["REDIS_HOST"]="localhost"
  ENV_VALUES["MINIO_ENDPOINT"]="localhost"
  ENV_VALUES["MONGODB_URI"]="mongodb://localhost:27017/kanboard?replicaSet=rs0"
fi

ENV_VALUES["NODE_ENV"]="${ENV_VALUES[NODE_ENV]:-production}"

sudo mkdir -p "$INSTALL_DIR"
echo "==> Copying package to ${INSTALL_DIR}"
sudo rsync -a --delete \
  --exclude node_modules \
  "${PKG_ROOT}/" "${INSTALL_DIR}/"

ENV_FILE="${INSTALL_DIR}/.env"
if [[ -f "${PKG_ROOT}/.env.example" ]]; then
  sudo cp "${PKG_ROOT}/.env.example" "$ENV_FILE"
fi

for key in "${!ENV_VALUES[@]}"; do
  val="${ENV_VALUES[$key]}"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sudo sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" | sudo tee -a "$ENV_FILE" >/dev/null
  fi
done
sudo chmod 600 "$ENV_FILE"

echo "==> Installing production dependencies"
(cd "$INSTALL_DIR" && sudo -u "$(logname 2>/dev/null || echo root)" env PATH="$PATH" bun install --frozen-lockfile --production)

if [[ "$MODE" == "docker" ]]; then
  require_cmd docker
  COMPOSE_FILE="${INSTALL_DIR}/install/docker/docker-compose.deps.yml"
  if docker compose version >/dev/null 2>&1; then
    (cd "${INSTALL_DIR}/install/docker" && docker compose --env-file "$ENV_FILE" -f docker-compose.deps.yml up -d)
  else
    (cd "${INSTALL_DIR}/install/docker" && docker-compose --env-file "$ENV_FILE" -f docker-compose.deps.yml up -d)
  fi
  whiptail --title "MongoDB" --msgbox "Wait for containers to become healthy, then ensure replica set rs0 is initialized (setup runs mongodb-init)." 10 60
fi

BACKUP_DIR="${ENV_VALUES[BACKUP_LOCATION]:-/var/backups/atlantisboard}"
sudo mkdir -p "$BACKUP_DIR"

if whiptail --title "systemd" --yesno "Install systemd units for atlantisboard and worker?" 10 70; then
  require_cmd systemctl
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
  sudo systemctl restart atlantisboard.service || true
  [[ "${ENV_VALUES[ENABLE_CRON_JOBS_IN_MAIN]:-false}" != "true" ]] && sudo systemctl restart atlantisboard-worker.service || true
fi

whiptail --title "Complete" --msgbox "Installation finished.\n\nInstall dir: ${INSTALL_DIR}\nOpen: ${ENV_VALUES[APP_URL]:-http://localhost:3000}\n\nSee DEPLOYMENT.md and docs/wiki/npm-install.md" 14 70
