#!/usr/bin/env bash
# Docker/Compose install, health-check, and retry helpers.

readonly ATL_DOCKER_COMPOSE_MAX_ATTEMPTS=3
readonly ATL_DOCKER_COMPOSE_RETRY_BASE_DELAY=15


## atl_docker_compose_works
# Return success when docker compose v2 is callable via sudo.
atl_docker_compose_works() {
  atl_cmd_exists docker && atl_sudo docker compose version >/dev/null 2>&1
}


atl_apt_package_available() {
  local pkg="$1"
  atl_cmd_exists apt-cache && apt-cache show "$pkg" >/dev/null 2>&1
}


atl_os_release_codename() {
  if [[ ! -f /etc/os-release ]]; then
    return 1
  fi
  # shellcheck disable=SC1091
  . /etc/os-release
  if [[ -n "${UBUNTU_CODENAME:-}" ]]; then
    printf '%s' "$UBUNTU_CODENAME"
    return 0
  fi
  if [[ -n "${VERSION_CODENAME:-}" ]]; then
    printf '%s' "$VERSION_CODENAME"
    return 0
  fi
  return 1
}


atl_apt_add_docker_official_repository() {
  if [[ -f /etc/apt/sources.list.d/docker.list ]]; then
    return 0
  fi
  atl_cmd_exists curl || atl_install_prerequisite_cmd curl apt || return 1
  atl_sudo install -m 0755 -d /etc/apt/keyrings
  if ! curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | atl_sudo tee /etc/apt/keyrings/docker.asc >/dev/null; then
    return 1
  fi
  atl_sudo chmod a+r /etc/apt/keyrings/docker.asc
  local codename fallback
  codename="$(atl_os_release_codename)" || codename=noble
  for fallback in "$codename" noble bookworm; do
    [[ -n "$fallback" ]] || continue
    echo \
      "deb [arch=$(dpkg --print-architecture) \
signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu ${fallback} stable" \
      | atl_sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
    if atl_sudo env DEBIAN_FRONTEND=noninteractive apt-get update -qq; then
      return 0
    fi
    atl_sudo rm -f /etc/apt/sources.list.d/docker.list
  done
  return 1
}


atl_install_docker_compose_for_pm() {
  local pm="$1"
  case "$pm" in
    apt)
      if atl_docker_compose_works; then
        return 0
      fi
      local -a candidates=()
      local pkg_line pkg
      pkg_line="$(
        atl_prereq_packages_for_cmd docker-compose-plugin apt
      )" || return 1
      read -r -a candidates <<<"$pkg_line"
      candidates+=(docker-compose-plugin)
      for pkg in "${candidates[@]}"; do
        [[ -n "$pkg" ]] || continue
        if ! atl_apt_package_available "$pkg"; then
          continue
        fi
        info "installing ${pkg}..."
        atl_pkg_install_packages apt "$pkg" || continue
        if atl_docker_compose_works; then
          return 0
        fi
      done
      info "trying Docker official apt repository for Compose..."
      if atl_apt_add_docker_official_repository; then
        atl_pkg_install_packages apt docker-compose-plugin || true
        atl_docker_compose_works && return 0
      fi
      return 1
      ;;
    *)
      atl_install_prerequisite_cmd docker-compose-plugin "$pm"
      ;;
  esac
}


atl_install_docker_prerequisites() {
  local pm="$1"
  local pkg_line
  local -a pkgs=()

  if ! atl_cmd_exists docker; then
    pkg_line="$(atl_prereq_packages_for_cmd docker-engine "$pm")" || return 1
    read -r -a pkgs <<<"$pkg_line"
    [[ ${#pkgs[@]} -gt 0 ]] || return 1
    info "installing ${pkgs[*]}..."
    atl_pkg_install_packages "$pm" "${pkgs[@]}" || return 1
    if atl_cmd_exists systemctl; then
      atl_sudo systemctl enable --now docker >/dev/null 2>&1 || true
    fi
  fi

  if atl_docker_compose_works; then
    return 0
  fi
  atl_install_docker_compose_for_pm "$pm"
}


atl_docker_existing_stack_detected() {
  local mode="$1"
  local -a containers=()
  case "$mode" in
    docker)
      containers=(
        atlantisboard-mongodb-deps
        atlantisboard-redis-deps
        atlantisboard-minio-deps
      )
      ;;
    fullstack)
      containers=(
        atlantisboard-mongodb-full
        atlantisboard-redis-full
        atlantisboard-minio-full
        atlantisboard-app-full
      )
      ;;
    *) return 1 ;;
  esac

  local name
  for name in "${containers[@]}"; do
    if atl_sudo docker ps -a --format '{{.Names}}' 2>/dev/null \
      | grep -qx "$name"; then
      return 0
    fi
  done

  if atl_sudo docker volume ls --format '{{.Name}}' 2>/dev/null \
    | grep -qE '(^|_)(mongo-data|redis-data|minio-data)(-full)?$'; then
    return 0
  fi
  return 1
}


atl_warn_docker_volume_desync() {
  local mode="$1"
  local prior_env="${2:-}"
  local -a desync_keys=()

  atl_docker_existing_stack_detected "$mode" || return 0

  if [[ -n "$prior_env" && -f "$prior_env" ]]; then
    local key old_val new_val
    for key in REDIS_PASSWORD MONGODB_APP_PASSWORD MONGODB_ROOT_PASSWORD \
      MINIO_SECRET_KEY MINIO_ACCESS_KEY MINIO_ROOT_SECRET_KEY \
      MINIO_ROOT_ACCESS_KEY; do
      [[ -n "${ENV_VALUES[$key]:-}" ]] || continue
      old_val="$(
        grep -E "^${key}=" "$prior_env" 2>/dev/null \
          | tail -1 \
          | cut -d= -f2- \
          || true
      )"
      new_val="${ENV_VALUES[$key]}"
      if [[ -n "$old_val" && "$old_val" != "$new_val" ]]; then
        desync_keys+=("$key")
      fi
    done
  fi

  local extra=""
  if [[ ${#desync_keys[@]} -gt 0 ]]; then
    extra="\n\nThese .env values changed since the last install:"
    local k
    for k in "${desync_keys[@]}"; do
      extra+="\n• ${k}"
    done
  fi

  local msg
  msg="Existing Docker containers or volumes were found for this stack.\n\n"
  msg+="New secrets in .env may not match passwords already stored in those "
  msg+="volumes (Redis, MongoDB, MinIO). Continuing often causes "
  msg+="authentication failures.${extra}\n\n"
  msg+="To reset data: install/docker/reset-docker-data.sh ${mode}\n\n"
  msg+="Continue anyway?"
  if ! atl_whiptail_yesno --title "Existing Docker data" --yesno \
    "$msg" 18 78; then
    exit 1
  fi
}


atl_wait_for_docker_deps() {
  local mode="$1"
  local timeout="${2:-120}"
  local start now elapsed
  local rs_eval
  rs_eval='try { quit(rs.status().ok === 1 ? 0 : 1) }'
  rs_eval+=' catch (e) { quit(1) }'
  start="$(date +%s)"

  local msg
  msg="Waiting for MongoDB replica set, Redis, and MinIO to become ready...\n\n"
  msg+="This can take up to ${timeout} seconds on first run."
  atl_whiptail_infobox --title "Starting dependencies" --infobox \
    "$msg" 10 70

  while true; do
    now="$(date +%s)"
    elapsed=$((now - start))
    if (( elapsed >= timeout )); then
      msg="Timed out after ${timeout}s waiting for Docker dependencies.\n\n"
      msg+="Check container logs, e.g.:\n"
      msg+="  cd ${INSTALL_DIR}/install/docker && docker compose \\\n"
      msg+="    --env-file image-defaults.env --env-file ../../.env \\\n"
      msg+="    -f docker-compose.fullstack.yml ps"
      atl_whiptail_msgbox --title "Dependency timeout" --msgbox \
        "$msg" 14 72 || true
      return 1
    fi

    local mongo_ok=false redis_ok=false minio_ok=false

    case "$mode" in
      docker)
        if [[ -n "${ENV_VALUES[MONGODB_URI]:-}" ]] \
          && command -v mongosh >/dev/null 2>&1; then
          if mongosh "${ENV_VALUES[MONGODB_URI]}" --quiet --eval \
            'try { quit(rs.status().ok === 1 ? 0 : 1) } catch (e) { quit(1) }' \
            >/dev/null 2>&1; then
            mongo_ok=true
          fi
        elif atl_sudo docker exec atlantisboard-mongodb-deps mongosh --quiet \
          -u "${ENV_VALUES[MONGODB_ROOT_USER]}" \
          -p "${ENV_VALUES[MONGODB_ROOT_PASSWORD]}" \
          --authenticationDatabase admin \
          --eval "$rs_eval" \
          >/dev/null 2>&1; then
          mongo_ok=true
        fi
        if atl_sudo docker exec atlantisboard-redis-deps redis-cli \
          -a "${ENV_VALUES[REDIS_PASSWORD]}" ping 2>/dev/null \
          | grep -q PONG; then
          redis_ok=true
        fi
        if curl -sf http://127.0.0.1:9000/minio/health/live \
          >/dev/null 2>&1; then
          minio_ok=true
        fi
        ;;
      fullstack)
        if atl_sudo docker exec atlantisboard-mongodb-full mongosh --quiet \
          -u "${ENV_VALUES[MONGODB_ROOT_USER]}" \
          -p "${ENV_VALUES[MONGODB_ROOT_PASSWORD]}" \
          --authenticationDatabase admin \
          --eval "$rs_eval" \
          >/dev/null 2>&1; then
          mongo_ok=true
        fi
        if atl_sudo docker exec atlantisboard-redis-full redis-cli \
          -a "${ENV_VALUES[REDIS_PASSWORD]}" ping 2>/dev/null \
          | grep -q PONG; then
          redis_ok=true
        fi
        if atl_sudo docker exec atlantisboard-minio-full curl -sf \
          http://localhost:9000/minio/health/live >/dev/null 2>&1; then
          minio_ok=true
        fi
        ;;
    esac

    if [[ "$mongo_ok" == true && "$redis_ok" == true \
      && "$minio_ok" == true ]]; then
      return 0
    fi
    sleep 2
  done
}


## atl_docker_compose_env_args
# Build docker compose --env-file arguments.
# Arguments:
#   $1 compose directory.
atl_docker_compose_env_args() {
  local compose_dir="$1"
  local env_file="${ENV_FILE:-}"
  local -a args=()
  if [[ -f "${compose_dir}/image-defaults.env" ]]; then
    args+=(--env-file "${compose_dir}/image-defaults.env")
  fi
  args+=(--env-file "$env_file")
  printf '%s\n' "${args[@]}"
}


## atl_docker_compose_run
# Execute docker compose; stream output to the console and a log file.
# Arguments:
#   compose_dir compose_file ...args
atl_docker_compose_run() {
  local compose_dir="$1" compose_file="$2"
  shift 2
  local -a env_args=()
  local log_file="${ATL_DOCKER_COMPOSE_LOG:-}"
  while IFS= read -r line; do
    [[ -n "$line" ]] && env_args+=("$line")
  done < <(atl_docker_compose_env_args "$compose_dir")
  # Avoid Compose Bake when buildx is not installed (Ubuntu docker.io);
  # classic build still works.
  local -a compose_env=(COMPOSE_BAKE=false)
  if [[ -z "$log_file" ]]; then
    log_file="$(mktemp)"
    ATL_DOCKER_COMPOSE_LOG="$log_file"
  else
    : >"$log_file"
  fi
  # Piped through tee (not a TTY); plain shows pull/build progress lines live.
  local -a progress_args=(--progress plain)
  local rc=0
  if atl_sudo docker compose version >/dev/null 2>&1; then
    (cd "$compose_dir" \
      && atl_sudo env "${compose_env[@]}" docker compose \
        "${env_args[@]}" -f "$compose_file" "${progress_args[@]}" "$@") \
      2>&1 | tee "$log_file" || rc=$?
    rc="${PIPESTATUS[0]:-$rc}"
  else
    (cd "$compose_dir" \
      && atl_sudo env "${compose_env[@]}" docker-compose \
        "${env_args[@]}" -f "$compose_file" "$@") \
      2>&1 | tee "$log_file" || rc=$?
    rc="${PIPESTATUS[0]:-$rc}"
  fi
  return "$rc"
}


## atl_docker_compose_log_excerpt
# Print the latest lines from compose log output.
atl_docker_compose_log_excerpt() {
  local log_file="${ATL_DOCKER_COMPOSE_LOG:-}"
  local excerpt=""
  if [[ -n "$log_file" && -f "$log_file" ]]; then
    excerpt="$(
      tail -n 10 "$log_file" 2>/dev/null \
        | sed 's/\\/\\\\/g' \
        | tr -d '\r' \
        || true
    )"
  fi
  if [[ -n "$excerpt" ]]; then
    printf '%s' "$excerpt"
  else
    printf '%s' "(no compose output captured — check the terminal scrollback)"
  fi
}


## atl_docker_prune_after_deploy
# Remove dangling images and unused build cache (does not affect running containers).
atl_docker_prune_after_deploy() {
  local reclaimed=""
  atl_sudo docker image prune -f >/dev/null 2>&1 || true
  reclaimed="$(atl_sudo docker builder prune -f 2>&1 | grep -E 'Total reclaimed space' | tail -1 || true)"
  if [[ -n "$reclaimed" ]]; then
    info "Docker build cache pruned (${reclaimed})"
  else
    info "Docker build cache pruned"
  fi
}


## atl_docker_compose_cleanup_log
# Remove temporary compose log file and reset path variable.
atl_docker_compose_cleanup_log() {
  if [[ -n "${ATL_DOCKER_COMPOSE_LOG:-}" \
    && -f "${ATL_DOCKER_COMPOSE_LOG}" ]]; then
    rm -f "${ATL_DOCKER_COMPOSE_LOG}"
  fi
  ATL_DOCKER_COMPOSE_LOG=""
}


## atl_docker_compose
# Run docker compose with retries and diagnostics.
# Arguments:
#   compose_dir compose_file ...args
atl_docker_compose() {
  local compose_dir="$1" compose_file="$2"
  shift 2
  local env_file="${ENV_FILE:-}"
  atl_docker_compose_cleanup_log
  if [[ -z "$env_file" ]]; then
    err "internal error: ENV_FILE is not set before docker compose"
    return 1
  fi
  if ! atl_sudo test -f "$env_file"; then
    err "${env_file} not found; run setup through .env creation first"
    return 1
  fi

  local max_attempts="${ATL_DOCKER_COMPOSE_MAX_ATTEMPTS}"
  local attempt=1 delay="${ATL_DOCKER_COMPOSE_RETRY_BASE_DELAY}"
  while [[ "$attempt" -le "$max_attempts" ]]; do
    if atl_docker_compose_run "$compose_dir" "$compose_file" "$@"; then
      atl_docker_prune_after_deploy
      atl_docker_compose_cleanup_log
      return 0
    fi
    if [[ "$attempt" -lt "$max_attempts" ]]; then
      err "docker compose failed (attempt ${attempt}/${max_attempts}); \
retrying in ${delay}s"
      sleep "$delay"
      delay=$((delay + 15))
    fi
    attempt=$((attempt + 1))
  done
  err "docker compose failed after ${max_attempts} attempts"
  err "check docker.io access or set ATLANTISBOARD_MINIO_IMAGE and"
  err "ATLANTISBOARD_MINIO_MC_IMAGE in .env to a mirror"
  return 1
}


# Run docker compose; on failure show whiptail error and offer to continue
# setup (e.g. reverse proxy).
# Returns 0 on compose success or if user chooses Continue anyway.
# Exits if user aborts.

## atl_docker_compose_or_continue
# Run compose and optionally continue after failure.
# Arguments:
#   compose_dir compose_file ...args
atl_docker_compose_or_continue() {
  local compose_dir="$1" compose_file="$2"
  shift 2
  local compose_label="${compose_file}"
  local install_hint="${INSTALL_DIR:-/opt/atlantisboard}"

  if atl_is_noninteractive; then
    atl_docker_compose "$compose_dir" "$compose_file" "$@" || exit 1
    return 0
  fi

  if atl_docker_compose "$compose_dir" "$compose_file" "$@"; then
    return 0
  fi

  local excerpt msg
  excerpt="$(atl_docker_compose_log_excerpt)"
  msg="docker compose did not finish successfully.\n\n"
  msg+="File: ${compose_label}\nDirectory: ${compose_dir}\n\n"
  msg+="Last output:\n${excerpt}\n\n"
  msg+="You can fix containers later with:\n"
  msg+="  cd ${install_hint}/install/docker\n"
  msg+="  sudo docker compose --env-file image-defaults.env --env-file ../../.env "
  msg+="-f ${compose_label} logs\n\n"
  msg+="Continue setup anyway (HTTPS reverse proxy and remaining steps)?"

  if atl_whiptail_yesno --title "Docker Compose failed" \
    --yesno "$msg" 22 78; then
    ATL_DOCKER_COMPOSE_DEFERRED=true
    atl_docker_compose_cleanup_log
    return 0
  fi

  atl_docker_compose_cleanup_log
  exit 1
}


## atl_wait_for_docker_deps_or_continue
# Wait for dependencies or allow user to continue.
# Arguments:
#   $1 mode, $2 timeout seconds (optional).
atl_wait_for_docker_deps_or_continue() {
  local mode="$1"
  local timeout="${2:-120}"
  if [[ "${ATL_DOCKER_COMPOSE_DEFERRED:-false}" == true ]]; then
    return 0
  fi
  if atl_wait_for_docker_deps "$mode" "$timeout"; then
    return 0
  fi
  if atl_is_noninteractive; then
    err "Docker dependencies did not become healthy within ${timeout} seconds"
    exit 1
  fi
  local msg
  msg="Docker dependencies did not become healthy within ${timeout} "
  msg+="seconds.\n\n"
  msg+="MongoDB, Redis, or MinIO may still be starting or misconfigured.\n\n"
  msg+="Continue setup anyway (HTTPS reverse proxy and remaining steps)?"
  if atl_whiptail_yesno --title "Docker health check" --yesno "$msg" 14 78; then
    return 0
  fi
  exit 1
}

# Set when compose failed but the user chose to continue.
ATL_DOCKER_COMPOSE_DEFERRED=false

