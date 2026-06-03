# Uninstall helpers for atlantisboard-setup (sourced by install/uninstall.sh).
# Expects install/lib/common.sh to be loaded first.

ATL_MANIFEST_NAME=".atlantisboard-install-manifest.json"
ATL_UNINSTALL_LOG_TAG="atlantisboard-uninstall"

# Populated by atl_uninstall_discover_state
ATL_UNINSTALL_MODE=""
ATL_UNINSTALL_INSTALL_DIR=""
ATL_UNINSTALL_ENV_FILE=""
ATL_UNINSTALL_BACKUP_DIR=""
ATL_UNINSTALL_MANIFEST_PATH=""
ATL_UNINSTALL_SYSTEMD_MAIN=false
ATL_UNINSTALL_SYSTEMD_WORKER=false
ATL_UNINSTALL_REVERSE_PROXY="none"
ATL_UNINSTALL_CREATED_USER=false

atl_uninstall_log() {
  printf '%s: %s\n' "$ATL_UNINSTALL_LOG_TAG" "$*" >&2
}

atl_uninstall_env_get() {
  local key="$1" file="$2"
  atl_sudo test -f "$file" 2>/dev/null || return 1
  atl_sudo grep -E "^${key}=" "$file" 2>/dev/null | tail -1 | cut -d= -f2- || return 1
}

atl_uninstall_read_manifest_field() {
  local field="$1" manifest="$2"
  atl_sudo test -f "$manifest" 2>/dev/null || return 1
  command -v jq >/dev/null 2>&1 || return 1
  atl_sudo cat "$manifest" 2>/dev/null | jq -r --arg f "$field" '.[$f] // empty' 2>/dev/null
}

atl_uninstall_default_install_dir() {
  printf '%s' "${ATLANTISBOARD_INSTALL_DIR:-/opt/atlantisboard}"
}

atl_uninstall_discover_install_dir() {
  local dir manifest="$1"
  local from_manifest from_unit candidate

  if [[ -z "$manifest" ]]; then
    for candidate in "$(atl_uninstall_default_install_dir)" /opt/atlantisboard; do
      if atl_sudo test -f "${candidate}/${ATL_MANIFEST_NAME}" 2>/dev/null; then
        manifest="${candidate}/${ATL_MANIFEST_NAME}"
        break
      fi
    done
  fi

  if [[ -n "$manifest" ]] && atl_sudo test -f "$manifest" 2>/dev/null; then
    from_manifest="$(atl_uninstall_read_manifest_field install_dir "$manifest")"
    if [[ -n "$from_manifest" && "$from_manifest" == /* ]]; then
      printf '%s' "${from_manifest%/}"
      return 0
    fi
  fi

  if atl_sudo test -f /etc/systemd/system/atlantisboard.service 2>/dev/null; then
    from_unit="$(atl_sudo grep -E '^EnvironmentFile=' /etc/systemd/system/atlantisboard.service 2>/dev/null \
      | head -1 | cut -d= -f2- | tr -d ' ')"
    if [[ -n "$from_unit" ]]; then
      dir="$(dirname "$from_unit")"
      if [[ "$dir" == /* ]]; then
        printf '%s' "${dir%/}"
        return 0
      fi
    fi
    from_unit="$(atl_sudo grep -E '^WorkingDirectory=' /etc/systemd/system/atlantisboard.service 2>/dev/null \
      | head -1 | cut -d= -f2- | tr -d ' ')"
    if [[ -n "$from_unit" && "$from_unit" == /* ]]; then
      printf '%s' "${from_unit%/}"
      return 0
    fi
  fi

  for dir in "$(atl_uninstall_default_install_dir)" /opt/atlantisboard; do
    if atl_sudo test -f "${dir}/.env" 2>/dev/null || atl_sudo test -f "${dir}/${ATL_MANIFEST_NAME}" 2>/dev/null; then
      printf '%s' "${dir%/}"
      return 0
    fi
  done

  return 1
}

atl_uninstall_detect_mode() {
  local manifest="$1" install_dir="$2" env_file="$3"
  local mode detected=""

  if [[ -n "$manifest" ]] && atl_sudo test -f "$manifest" 2>/dev/null; then
    mode="$(atl_uninstall_read_manifest_field mode "$manifest")"
  fi
  if [[ -z "$mode" && -n "$env_file" ]] && atl_sudo test -f "$env_file" 2>/dev/null; then
    mode="$(atl_uninstall_env_get ATLANTISBOARD_INSTALL_MODE "$env_file" 2>/dev/null || true)"
  fi

  if [[ -n "$mode" ]]; then
    case "$mode" in
      fullstack | docker | manual) printf '%s' "$mode"; return 0 ;;
    esac
  fi

  if atl_sudo docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx 'atlantisboard-app-full'; then
    detected=fullstack
  elif atl_sudo docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx 'atlantisboard-mongodb-deps'; then
    detected=docker
  elif atl_sudo test -f /etc/systemd/system/atlantisboard.service 2>/dev/null; then
    detected=docker
  elif [[ -n "$install_dir" ]] && atl_sudo test -d "$install_dir" 2>/dev/null; then
    detected=manual
  fi

  [[ -n "$detected" ]] && printf '%s' "$detected"
}

atl_uninstall_collect_docker_containers() {
  local mode="$1"
  case "$mode" in
    fullstack)
      printf '%s\n' \
        atlantisboard-app-full \
        atlantisboard-mongodb-full \
        atlantisboard-mongodb-init-full \
        atlantisboard-redis-full \
        atlantisboard-minio-full \
        atlantisboard-minio-setup-full \
        atlantisboard-clamav-full
      ;;
    docker)
      printf '%s\n' \
        atlantisboard-mongodb-deps \
        atlantisboard-mongodb-init-deps \
        atlantisboard-redis-deps \
        atlantisboard-minio-deps \
        atlantisboard-minio-setup-deps \
        atlantisboard-clamav-deps
      ;;
    *)
      printf '%s\n' \
        atlantisboard-app-full \
        atlantisboard-mongodb-full \
        atlantisboard-mongodb-init-full \
        atlantisboard-redis-full \
        atlantisboard-minio-full \
        atlantisboard-minio-setup-full \
        atlantisboard-clamav-full \
        atlantisboard-mongodb-deps \
        atlantisboard-mongodb-init-deps \
        atlantisboard-redis-deps \
        atlantisboard-minio-deps \
        atlantisboard-minio-setup-deps \
        atlantisboard-clamav-deps
      ;;
  esac
}

atl_uninstall_collect_docker_volumes() {
  local mode="$1"
  case "$mode" in
    fullstack)
      printf '%s\n' \
        mongo-data-full mongo-config-full redis-data-full minio-data-full clamav-db-full \
        docker_mongo-data-full docker_mongo-config-full docker_redis-data-full \
        docker_minio-data-full docker_clamav-db-full
      ;;
    docker)
      printf '%s\n' \
        mongo-data mongo-config redis-data minio-data clamav-db \
        docker_mongo-data docker_mongo-config docker_redis-data docker_minio-data docker_clamav-db
      ;;
    *)
      printf '%s\n' \
        mongo-data-full mongo-config-full redis-data-full minio-data-full clamav-db-full \
        mongo-data mongo-config redis-data minio-data clamav-db \
        docker_mongo-data-full docker_mongo-config-full docker_redis-data-full \
        docker_minio-data-full docker_clamav-db-full \
        docker_mongo-data docker_mongo-config docker_redis-data docker_minio-data docker_clamav-db
      ;;
  esac
}

atl_uninstall_collect_tracked_paths() {
  local install_dir="$1" backup_dir="$2" mode="$3" reverse_proxy="$4"
  local -a paths=()

  [[ -n "$install_dir" ]] && paths+=("$install_dir")
  [[ -n "$backup_dir" && "$backup_dir" != "$install_dir" ]] && paths+=("$backup_dir")
  paths+=(
    /etc/systemd/system/atlantisboard.service
    /etc/systemd/system/atlantisboard-worker.service
    /etc/nginx/sites-available/atlantisboard
    /etc/nginx/sites-enabled/atlantisboard
    /etc/caddy/conf.d/atlantisboard.caddy
    /etc/caddy/conf.d/00-acme-email.caddy
    /var/log/caddy/atlantisboard.log
  )

  if [[ -n "$install_dir" ]]; then
    paths+=(
      "${install_dir}/${ATL_MANIFEST_NAME}"
      "${install_dir}/atlantisboard-uninstall"
      "${install_dir}/install/uninstall.sh"
    )
  fi

  local p
  for p in "${paths[@]}"; do
    [[ -n "$p" ]] && printf '%s\n' "$p"
  done | awk '!seen[$0]++'
}

atl_uninstall_discover_state() {
  local pkg_root="$1"
  local manifest=""

  ATL_UNINSTALL_INSTALL_DIR=""
  ATL_UNINSTALL_ENV_FILE=""
  ATL_UNINSTALL_BACKUP_DIR=""
  ATL_UNINSTALL_MANIFEST_PATH=""
  ATL_UNINSTALL_MODE=""
  ATL_UNINSTALL_SYSTEMD_MAIN=false
  ATL_UNINSTALL_SYSTEMD_WORKER=false
  ATL_UNINSTALL_REVERSE_PROXY="none"
  ATL_UNINSTALL_CREATED_USER=false

  if dir="$(atl_uninstall_discover_install_dir "")"; then
    ATL_UNINSTALL_INSTALL_DIR="$dir"
    ATL_UNINSTALL_MANIFEST_PATH="${dir}/${ATL_MANIFEST_NAME}"
    if atl_sudo test -f "$ATL_UNINSTALL_MANIFEST_PATH" 2>/dev/null; then
      manifest="$ATL_UNINSTALL_MANIFEST_PATH"
    fi
    ATL_UNINSTALL_ENV_FILE="${dir}/.env"
  fi

  if [[ -z "$manifest" && -n "$ATL_UNINSTALL_INSTALL_DIR" ]] \
    && atl_sudo test -f "${ATL_UNINSTALL_INSTALL_DIR}/${ATL_MANIFEST_NAME}" 2>/dev/null; then
    manifest="${ATL_UNINSTALL_INSTALL_DIR}/${ATL_MANIFEST_NAME}"
    ATL_UNINSTALL_MANIFEST_PATH="$manifest"
  fi

  if ! atl_sudo test -f "${ATL_UNINSTALL_ENV_FILE:-}" 2>/dev/null \
    && [[ -n "$ATL_UNINSTALL_INSTALL_DIR" ]] \
    && atl_sudo test -f "${ATL_UNINSTALL_INSTALL_DIR}/.env" 2>/dev/null; then
    ATL_UNINSTALL_ENV_FILE="${ATL_UNINSTALL_INSTALL_DIR}/.env"
  fi

  if atl_sudo test -f "${ATL_UNINSTALL_ENV_FILE:-}" 2>/dev/null; then
    ATL_UNINSTALL_BACKUP_DIR="$(atl_uninstall_env_get BACKUP_LOCATION "$ATL_UNINSTALL_ENV_FILE" 2>/dev/null || true)"
    ATL_UNINSTALL_BACKUP_DIR="$(atl_normalize_backup_dir "${ATL_UNINSTALL_BACKUP_DIR:-}")"
  fi
  if [[ -z "${ATL_UNINSTALL_BACKUP_DIR:-}" && -n "$manifest" ]] \
    && atl_sudo test -f "$manifest" 2>/dev/null; then
    ATL_UNINSTALL_BACKUP_DIR="$(atl_uninstall_read_manifest_field backup_dir "$manifest")"
  fi

  ATL_UNINSTALL_MODE="$(atl_uninstall_detect_mode "$manifest" "${ATL_UNINSTALL_INSTALL_DIR:-}" "${ATL_UNINSTALL_ENV_FILE:-}" || true)"

  if [[ -n "$manifest" ]] && atl_sudo test -f "$manifest" 2>/dev/null && command -v jq >/dev/null 2>&1; then
    [[ "$(atl_sudo cat "$manifest" | jq -r '.systemd.main // false')" == "true" ]] && ATL_UNINSTALL_SYSTEMD_MAIN=true
    [[ "$(atl_sudo cat "$manifest" | jq -r '.systemd.worker // false')" == "true" ]] && ATL_UNINSTALL_SYSTEMD_WORKER=true
    ATL_UNINSTALL_REVERSE_PROXY="$(atl_sudo cat "$manifest" | jq -r '.reverse_proxy // "none"')"
    [[ "$(atl_sudo cat "$manifest" | jq -r '.systemd.created_user // false')" == "true" ]] && ATL_UNINSTALL_CREATED_USER=true
    local mmode
    mmode="$(atl_sudo cat "$manifest" | jq -r '.mode // empty')"
    [[ -n "$mmode" ]] && ATL_UNINSTALL_MODE="$mmode"
  fi

  if [[ "$ATL_UNINSTALL_SYSTEMD_MAIN" != true ]] && atl_sudo test -f /etc/systemd/system/atlantisboard.service 2>/dev/null; then
    ATL_UNINSTALL_SYSTEMD_MAIN=true
  fi
  if [[ "$ATL_UNINSTALL_SYSTEMD_WORKER" != true ]] && atl_sudo test -f /etc/systemd/system/atlantisboard-worker.service 2>/dev/null; then
    ATL_UNINSTALL_SYSTEMD_WORKER=true
  fi
  if [[ "$ATL_UNINSTALL_REVERSE_PROXY" == "none" ]]; then
    atl_sudo test -f /etc/nginx/sites-available/atlantisboard 2>/dev/null && ATL_UNINSTALL_REVERSE_PROXY=nginx
    atl_sudo test -f /etc/caddy/conf.d/atlantisboard.caddy 2>/dev/null && ATL_UNINSTALL_REVERSE_PROXY=caddy
  fi
  if id atlantisboard >/dev/null 2>&1; then
    ATL_UNINSTALL_CREATED_USER=true
  fi

  [[ -n "${ATL_UNINSTALL_MODE:-}" ]]
}

atl_uninstall_stop_systemd() {
  local unit
  for unit in atlantisboard-worker.service atlantisboard.service; do
    atl_sudo systemctl stop "$unit" 2>/dev/null || true
    atl_sudo systemctl disable "$unit" 2>/dev/null || true
  done
  atl_sudo systemctl daemon-reload 2>/dev/null || true
}

atl_uninstall_remove_systemd_units() {
  atl_sudo rm -f /etc/systemd/system/atlantisboard.service /etc/systemd/system/atlantisboard-worker.service
  atl_sudo systemctl daemon-reload 2>/dev/null || true
  atl_sudo systemctl reset-failed 2>/dev/null || true
}

atl_uninstall_compose_down() {
  local compose_dir="$1" compose_file="$2" env_file="$3"
  [[ -d "$compose_dir" ]] || return 0
  [[ -f "${compose_dir}/${compose_file}" ]] || return 0

  local -a env_args=()
  if [[ -f "${compose_dir}/image-defaults.env" ]]; then
    env_args+=(--env-file "${compose_dir}/image-defaults.env")
  fi
  if [[ -n "$env_file" ]] && atl_sudo test -f "$env_file"; then
    env_args+=(--env-file "$env_file")
  elif [[ -f "${compose_dir}/../../.env" ]]; then
    env_args+=(--env-file "${compose_dir}/../../.env")
  fi

  if atl_sudo docker compose version >/dev/null 2>&1; then
    (cd "$compose_dir" && atl_sudo env COMPOSE_BAKE=false docker compose "${env_args[@]}" -f "$compose_file" down -v --remove-orphans 2>/dev/null) || true
    (cd "$compose_dir" && atl_sudo env COMPOSE_BAKE=false docker compose "${env_args[@]}" -f "$compose_file" down -v --rmi local --remove-orphans 2>/dev/null) || true
  elif atl_cmd_exists docker-compose; then
    (cd "$compose_dir" && atl_sudo docker-compose "${env_args[@]}" -f "$compose_file" down -v --remove-orphans 2>/dev/null) || true
  fi
}

atl_uninstall_remove_docker() {
  local mode="$1" install_dir="$2" env_file="$3"
  local name vol

  case "$mode" in
    fullstack)
      atl_uninstall_compose_down "${install_dir}/install/docker" docker-compose.fullstack.yml "$env_file"
      ;;
    docker)
      atl_uninstall_compose_down "${install_dir}/install/docker" docker-compose.deps.yml "$env_file"
      ;;
    *)
      atl_uninstall_compose_down "${install_dir}/install/docker" docker-compose.fullstack.yml "$env_file"
      atl_uninstall_compose_down "${install_dir}/install/docker" docker-compose.deps.yml "$env_file"
      ;;
  esac

  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    atl_sudo docker rm -f "$name" 2>/dev/null || true
  done < <(atl_uninstall_collect_docker_containers "$mode")

  while IFS= read -r vol; do
    [[ -n "$vol" ]] || continue
    atl_sudo docker volume rm -f "$vol" 2>/dev/null || true
  done < <(atl_uninstall_collect_docker_volumes "$mode")

  atl_sudo docker network rm atlantisboard-full 2>/dev/null || true
  atl_sudo docker network rm docker_atlantisboard-full 2>/dev/null || true

  atl_sudo docker image rm -f docker-app:latest 2>/dev/null || true
  atl_sudo docker image rm -f docker_app:latest 2>/dev/null || true
}

atl_uninstall_remove_reverse_proxy() {
  local kind="$1"
  case "$kind" in
    nginx)
      atl_sudo rm -f /etc/nginx/sites-enabled/atlantisboard /etc/nginx/sites-available/atlantisboard
      if atl_sudo test -f /etc/nginx/sites-available/default 2>/dev/null \
        && ! atl_sudo test -e /etc/nginx/sites-enabled/default 2>/dev/null; then
        atl_sudo ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default 2>/dev/null || true
      fi
      atl_cmd_exists nginx && atl_sudo nginx -t 2>/dev/null && atl_sudo systemctl reload nginx 2>/dev/null || true
      ;;
    caddy)
      atl_sudo rm -f /etc/caddy/conf.d/atlantisboard.caddy /etc/caddy/conf.d/00-acme-email.caddy
      atl_cmd_exists caddy && atl_sudo systemctl reload caddy 2>/dev/null || true
      ;;
    *)
      atl_sudo rm -f /etc/nginx/sites-enabled/atlantisboard /etc/nginx/sites-available/atlantisboard \
        /etc/caddy/conf.d/atlantisboard.caddy /etc/caddy/conf.d/00-acme-email.caddy 2>/dev/null || true
      ;;
  esac
}

atl_uninstall_remove_path() {
  local path="$1"
  [[ -n "$path" ]] || return 0
  if atl_sudo test -e "$path" 2>/dev/null; then
    atl_sudo rm -rf "$path"
  elif [[ -e "$path" ]]; then
    rm -rf "$path"
  fi
}

atl_uninstall_remove_system_user() {
  if id atlantisboard >/dev/null 2>&1; then
    atl_sudo userdel -r atlantisboard 2>/dev/null || atl_sudo userdel atlantisboard 2>/dev/null || true
  fi
}

atl_uninstall_verify_remaining() {
  local -a remaining=()
  local path name vol

  for path in \
    "${ATL_UNINSTALL_INSTALL_DIR}" \
    "${ATL_UNINSTALL_BACKUP_DIR}" \
    /etc/systemd/system/atlantisboard.service \
    /etc/systemd/system/atlantisboard-worker.service \
    /etc/nginx/sites-available/atlantisboard \
    /etc/caddy/conf.d/atlantisboard.caddy; do
    [[ -n "$path" ]] || continue
    if atl_sudo test -e "$path" 2>/dev/null || [[ -e "$path" ]]; then
      remaining+=("$path still exists")
    fi
  done

  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    if atl_sudo docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$name"; then
      remaining+=("container ${name} still exists")
    fi
  done < <(atl_uninstall_collect_docker_containers "${ATL_UNINSTALL_MODE:-}")

  if ((${#remaining[@]} > 0)); then
    printf '%s\n' "${remaining[@]}"
    return 1
  fi
  return 0
}

atl_uninstall_remove_self_scripts() {
  local pkg_root="$1"
  local -a self_paths=()

  self_paths+=(
    "${pkg_root}/atlantisboard-uninstall"
    "${pkg_root}/install/uninstall.sh"
    "${pkg_root}/install/lib/uninstall-lib.sh"
  )
  if [[ -n "${ATL_UNINSTALL_INSTALL_DIR:-}" && "${ATL_UNINSTALL_INSTALL_DIR}" != "$pkg_root" ]]; then
    self_paths+=(
      "${ATL_UNINSTALL_INSTALL_DIR}/atlantisboard-uninstall"
      "${ATL_UNINSTALL_INSTALL_DIR}/install/uninstall.sh"
      "${ATL_UNINSTALL_INSTALL_DIR}/install/lib/uninstall-lib.sh"
      "${ATL_UNINSTALL_INSTALL_DIR}/${ATL_MANIFEST_NAME}"
    )
  fi

  local p
  for p in "${self_paths[@]}"; do
    [[ -n "$p" ]] || continue
    if [[ -e "$p" ]]; then
      rm -f "$p" 2>/dev/null || atl_sudo rm -f "$p" 2>/dev/null || true
    fi
  done
}

atl_write_install_manifest() {
  local mode="$1"
  local install_dir="$2"
  local env_file="$3"
  local backup_dir="$4"
  local systemd_main="${5:-false}"
  local systemd_worker="${6:-false}"
  local reverse_proxy="${7:-none}"
  local created_user="${8:-false}"
  local pkg_root="$9"
  local manifest_path="${install_dir}/${ATL_MANIFEST_NAME}"
  local tmp installed_at
  installed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u)"

  local jq_main jq_worker jq_user
  tmp="$(mktemp)"
  if [[ "$systemd_main" == true ]]; then jq_main=true; else jq_main=false; fi
  if [[ "$systemd_worker" == true ]]; then jq_worker=true; else jq_worker=false; fi
  if [[ "$created_user" == true ]]; then jq_user=true; else jq_user=false; fi
  if command -v jq >/dev/null 2>&1; then
    jq -n \
      --arg version "1" \
      --arg mode "$mode" \
      --arg installed_at "$installed_at" \
      --arg install_dir "$install_dir" \
      --arg env_file "$env_file" \
      --arg backup_dir "$backup_dir" \
      --arg package_root "$pkg_root" \
      --arg reverse_proxy "$reverse_proxy" \
      --argjson systemd_main "$jq_main" \
      --argjson systemd_worker "$jq_worker" \
      --argjson created_user "$jq_user" \
      '{
        version: $version,
        mode: $mode,
        installed_at: $installed_at,
        install_dir: $install_dir,
        env_file: $env_file,
        backup_dir: $backup_dir,
        package_root: $package_root,
        reverse_proxy: $reverse_proxy,
        systemd: { main: $systemd_main, worker: $systemd_worker, created_user: $created_user }
      }' >"$tmp"
  else
    cat >"$tmp" <<EOF
{"version":"1","mode":"${mode}","installed_at":"${installed_at}","install_dir":"${install_dir}","env_file":"${env_file}","backup_dir":"${backup_dir}","package_root":"${pkg_root}","reverse_proxy":"${reverse_proxy}","systemd":{"main":${jq_main},"worker":${jq_worker},"created_user":${jq_user}}}
EOF
  fi

  atl_sudo install -m 600 -o root -g root "$tmp" "$manifest_path"
  rm -f "$tmp"
}
