#!/usr/bin/env bash
# System prerequisites, package manager, preflight, and systemd helpers.


atl_cmd_exists() {
  command -v "$1" >/dev/null 2>&1
}


atl_sudo_works() {
  if sudo -n true 2>/dev/null; then
    return 0
  fi
  sudo -v >/dev/null 2>&1
}


atl_port_listening() {
  local port="$1"
  if atl_cmd_exists ss; then
    ss -tlnH "( sport = :${port} )" 2>/dev/null | grep -q .
    return
  fi
  if atl_cmd_exists nc; then
    nc -z localhost "$port" >/dev/null 2>&1
    return
  fi
  return 2
}


atl_install_parent_writable() {
  local dir="$1"
  local parent
  parent="$(dirname "$dir")"
  while [[ "$parent" != "/" && ! -d "$parent" ]]; do
    parent="$(dirname "$parent")"
  done
  [[ -w "$parent" ]] || atl_sudo test -w "$parent" 2>/dev/null
}


atl_detect_pkg_manager() {
  if atl_cmd_exists apt-get; then
    printf '%s' apt
    return 0
  fi
  if atl_cmd_exists dnf; then
    printf '%s' dnf
    return 0
  fi
  if atl_cmd_exists yum; then
    printf '%s' yum
    return 0
  fi
  if atl_cmd_exists apk; then
    printf '%s' apk
    return 0
  fi
  return 1
}


# Map CLI command names to distro packages (whiptail, jq, docker, …).
atl_prereq_packages_for_cmd() {
  local cmd="$1" pm="$2"
  case "$cmd" in
    whiptail)
      case "$pm" in
        apt | apk) printf '%s' whiptail ;;
        dnf | yum) printf '%s' newt ;;
      esac
      ;;
    openssl) printf '%s' openssl ;;
    jq) printf '%s' jq ;;
    rsync) printf '%s' rsync ;;
    bash) printf '%s' bash ;;
    ss)
      case "$pm" in
        apt) printf '%s' iproute2 ;;
        dnf | yum) printf '%s' iproute ;;
        apk) printf '%s' iproute2 ;;
      esac
      ;;
    nc)
      case "$pm" in
        apt) printf '%s' netcat-openbsd ;;
        dnf | yum) printf '%s' nmap-ncat ;;
        apk) printf '%s' netcat-openbsd ;;
      esac
      ;;
    curl) printf '%s' curl ;;
    docker-engine)
      case "$pm" in
        apt) printf '%s' docker.io ;;
        dnf | yum) printf '%s' docker ;;
        apk) printf '%s' docker ;;
      esac
      ;;
    docker-compose-plugin)
      case "$pm" in
        # Ubuntu/Debian universe: docker-compose-v2
        # (not docker-compose-plugin from Docker CE repo).
        apt) printf '%s' docker-compose-v2 ;;
        dnf | yum) printf '%s' docker-compose-plugin ;;
        apk) printf '%s' docker-cli-compose ;;
      esac
      ;;
    *)
      return 1
      ;;
  esac
}


atl_pkg_install_packages() {
  local pm="$1"
  shift
  local -a pkgs=("$@")
  [[ ${#pkgs[@]} -gt 0 ]] || return 0
  [[ "${ATLANTISBOARD_SKIP_PKG_INSTALL:-}" == "1" ]] && return 0

  case "$pm" in
    apt)
      atl_sudo env DEBIAN_FRONTEND=noninteractive apt-get update -qq
      local pkg install_ok=true
      for pkg in "${pkgs[@]}"; do
        if ! atl_sudo env DEBIAN_FRONTEND=noninteractive \
          apt-get install -y -qq "$pkg"; then
          install_ok=false
          err "warning: package install failed: ${pkg}"
        fi
      done
      [[ "$install_ok" == true ]]
      ;;
    dnf)
      atl_sudo dnf install -y "${pkgs[@]}"
      ;;
    yum)
      atl_sudo yum install -y "${pkgs[@]}"
      ;;
    apk)
      atl_sudo apk add --no-cache "${pkgs[@]}"
      ;;
    *)
      return 1
      ;;
  esac
}


atl_install_prerequisite_cmd() {
  local cmd="$1" pm="$2"
  local pkg_line
  pkg_line="$(atl_prereq_packages_for_cmd "$cmd" "$pm")" || return 1
  read -r -a pkgs <<<"$pkg_line"
  [[ ${#pkgs[@]} -gt 0 ]] || return 1
  atl_pkg_install_packages "$pm" "${pkgs[@]}"
}


atl_bootstrap_whiptail() {
  atl_cmd_exists whiptail && return 0
  [[ "${ATLANTISBOARD_SKIP_PKG_INSTALL:-}" == "1" ]] && return 1
  local pm
  pm="$(atl_detect_pkg_manager)" || return 1
  info "installing whiptail (required for the installer)..."
  info "sudo may prompt for your password."
  atl_ensure_sudo_credentials || return 1
  atl_install_prerequisite_cmd whiptail "$pm" || return 1
  atl_cmd_exists whiptail
}


atl_install_port_check_tools() {
  local pm="$1"
  if atl_cmd_exists ss || atl_cmd_exists nc; then
    return 0
  fi
  atl_install_prerequisite_cmd ss "$pm" \
    || atl_install_prerequisite_cmd nc "$pm" \
    || return 1
}


## atl_offer_install_prerequisites
# Offer package installation for missing prerequisites.
# Arguments:
#   $1 install mode.
atl_offer_install_prerequisites() {
  local mode="$1"
  local pm
  local -a missing_labels=() missing_cmds=()
  local need_docker=false need_port_tools=false need_curl=false

  [[ "${ATLANTISBOARD_SKIP_PKG_INSTALL:-}" == "1" ]] && return 0
  pm="$(atl_detect_pkg_manager)" || return 0

  local cmd
  for cmd in openssl jq rsync; do
    if ! atl_cmd_exists "$cmd"; then
      missing_cmds+=("$cmd")
      missing_labels+=("$cmd")
    fi
  done

  case "$mode" in
    docker | fullstack)
      if ! atl_cmd_exists docker || ! atl_docker_compose_works; then
        need_docker=true
        missing_labels+=("Docker Engine and Compose (docker compose)")
      fi
      ;;
  esac

  if ! atl_cmd_exists ss && ! atl_cmd_exists nc; then
    need_port_tools=true
    missing_labels+=("ss or nc (port checks)")
  fi

  case "$mode" in
    docker | manual)
      if ! atl_cmd_exists bun; then
        if ! atl_cmd_exists curl; then
          need_curl=true
          missing_labels+=("curl (for Bun install)")
        fi
      fi
      ;;
  esac

  if [[ ${#missing_cmds[@]} -eq 0 \
    && "$need_docker" != true \
    && "$need_port_tools" != true \
    && "$need_curl" != true ]]; then
    return 0
  fi

  local msg="The installer can try to install missing packages using ${pm}:\n\n"
  local item
  for item in "${missing_labels[@]}"; do
    msg+="- ${item}\n"
  done
  msg+="\nThis requires administrator privileges. Continue?"

  if ! atl_whiptail_display \
    --title "Install prerequisites" --yesno "$msg" 14 78; then
    return 0
  fi

  if ! atl_ensure_sudo_credentials; then
    msg="Could not obtain sudo privileges.\n\nRun:\n"
    msg+="  sudo ./atlantisboard-setup\n\n"
    msg+="Or enter your password when sudo prompts in this terminal."
    atl_whiptail_display --title "Administrator access" --msgbox \
      "$msg" 14 72 || true
    return 0
  fi

  info "installing prerequisites via ${pm} (sudo may prompt again)..."

  for cmd in "${missing_cmds[@]}"; do
    atl_install_prerequisite_cmd "$cmd" "$pm" || true
  done

  if [[ "$need_port_tools" == true ]]; then
    atl_install_port_check_tools "$pm" || true
  fi

  if [[ "$need_curl" == true ]]; then
    atl_install_prerequisite_cmd curl "$pm" || true
  fi

  if [[ "$need_docker" == true ]]; then
    atl_install_docker_prerequisites "$pm" || true
  fi
}


## atl_preflight_fail
# Show a blocking preflight message and exit.
# Arguments:
#   $1 details text.
atl_preflight_fail() {
  local message="$1"
  local msg
  msg="Some prerequisites are missing or failed:\n\n${message}\n\n"
  msg+="Fix these issues and run atlantisboard-setup again."
  atl_whiptail_display --title "Preflight check failed" --msgbox \
    "$msg" 22 78 || true
  exit 1
}


## atl_verify_app_port
# Ensure the app/dependency ports are available before install.
# Arguments:
#   $1 install mode (optional, defaults to manual).
atl_verify_app_port() {
  local mode="${1:-manual}"
  local -a lines=()
  local app_port="${ENV_VALUES[PORT]:-3000}"
  local port_status=0

  atl_port_listening "$app_port" || port_status=$?
  if [[ $port_status -eq 0 ]]; then
    line="Port ${app_port} is already in use — stop the service using it "
    line+="or choose another PORT"
    lines+=("$line")
  elif [[ $port_status -eq 2 ]]; then
    line="Cannot check port ${app_port} — install ss (iproute2) "
    line+="or nc (netcat)"
    lines+=("$line")
  fi

  case "$mode" in
    docker | fullstack)
      local skip_dep_ports=false
      if atl_docker_existing_stack_detected "$mode"; then
        skip_dep_ports=true
      fi
      if [[ "$skip_dep_ports" != true ]]; then
        for dep_port in 27017 6379 9000; do
          port_status=0
          atl_port_listening "$dep_port" || port_status=$?
          if [[ $port_status -eq 0 ]]; then
            line="Port ${dep_port} is already in use — required for MongoDB, "
            line+="Redis, or MinIO containers"
            lines+=("$line")
          elif [[ $port_status -eq 2 ]]; then
            line="Cannot check port ${dep_port} — install ss (iproute2) "
            line+="or nc (netcat)"
            lines+=("$line")
          fi
        done
      fi
      ;;
  esac

  if [[ ${#lines[@]} -gt 0 ]]; then
    atl_preflight_fail "$(printf '%s\n\n' "${lines[@]}")"
  fi
}


## atl_preflight_check
# Verify required commands and environment before install.
# Arguments:
#   $1 install mode.
atl_preflight_check() {
  local mode="$1"
  local -a lines=()
  local line

  atl_offer_install_prerequisites "$mode"

  for cmd in whiptail openssl jq rsync bash; do
    if ! atl_cmd_exists "$cmd"; then
      case "$cmd" in
        whiptail)
          line="whiptail — install: sudo apt install whiptail (Debian/Ubuntu) \
or sudo dnf install newt (Fedora)"
          ;;
        openssl)
          line="openssl — install: sudo apt install openssl or "
          line+="sudo dnf install openssl"
          ;;
        jq) line="jq — install: sudo apt install jq or sudo dnf install jq" ;;
        rsync)
          line="rsync — install: sudo apt install rsync "
          line+="or sudo dnf install rsync"
          ;;
        bash) line="bash — install a POSIX shell with bash" ;;
        *) line="$cmd — install via your package manager" ;;
      esac
      lines+=("$line")
    fi
  done

  if ! atl_sudo_works && [[ "$(id -u)" -ne 0 ]]; then
    lines+=("sudo — run as root or enable sudo (e.g. sudo atlantisboard-setup)")
  fi

  atl_finalize_install_dir
  # INSTALL_DIR is set by atl_finalize_install_dir above.
  # shellcheck disable=SC2153
  if ! atl_sudo mkdir -p "$(dirname "$INSTALL_DIR")" 2>/dev/null; then
    lines+=("Cannot create install path parent $(dirname "$INSTALL_DIR") — run \
with sudo")
  fi

  case "$mode" in
    docker | fullstack)
      if ! atl_cmd_exists docker; then
        line="docker — install Docker Engine: "
        line+="https://docs.docker.com/engine/install/"
        lines+=("$line")
      elif ! atl_docker_compose_works; then
        line="docker compose v2 — install: sudo apt install docker-compose-v2 "
        line+="(Ubuntu/Debian) or docker-compose-plugin "
        line+="from Docker’s apt repo; "
        line+="verify with: sudo docker compose version"
        lines+=("$line")
      fi
      ;;
  esac

  case "$mode" in
    docker | manual)
      if ! atl_cmd_exists bun; then
        if ! atl_cmd_exists curl; then
          line="bun — not found; install Bun (https://bun.sh) or install curl "
          line+="to fetch the Bun installer"
          lines+=("$line")
        elif ! curl -fsSL --connect-timeout 10 --max-time 20 \
          https://bun.sh/install -o /dev/null 2>/dev/null; then
          line="bun — not found and https://bun.sh is unreachable — "
          line+="install Bun "
          line+="manually or fix network access"
          lines+=("$line")
        fi
      fi
      ;;
  esac

  if [[ ${#lines[@]} -gt 0 ]]; then
    atl_preflight_fail "$(printf '%s\n\n' "${lines[@]}")"
  fi
}


## atl_require_systemctl
# Require systemctl availability for service install flow.
atl_require_systemctl() {
  if ! atl_cmd_exists systemctl; then
    local msg
    msg="systemctl was not found on this system.\n\n"
    msg+="Automatic startup via systemd is only supported on Linux systems "
    msg+="with systemd.\n\nSkip systemd setup and start Atlantisboard manually."
    atl_whiptail_msgbox --title "systemd unavailable" --msgbox \
      "$msg" 14 72
    return 1
  fi
  return 0
}


## atl_ensure_bun
# Ensure Bun is available at /usr/local/bin/bun.
atl_ensure_bun() {
  if [[ -x /usr/local/bin/bun ]]; then
    printf '%s' /usr/local/bin/bun
    return 0
  fi
  if atl_cmd_exists bun; then
    local existing
    existing="$(command -v bun)"
    if [[ "$existing" != /usr/local/bin/bun ]]; then
      atl_sudo install -d /usr/local/bin
      atl_sudo ln -sf "$existing" /usr/local/bin/bun
    fi
    printf '%s' /usr/local/bin/bun
    return 0
  fi
  if atl_whiptail_yesno --title "Install Bun?" --yesno \
    "Bun is required but was not found.\n\nInstall Bun to /usr/local/bin so \
the atlantisboard systemd user can run it (ProtectHome=true)?" \
    12 72; then
    atl_whiptail_infobox --title "Installing Bun" --infobox \
      "Downloading and installing Bun to /usr/local ...\n\nPlease wait." 8 60
    atl_sudo mkdir -p /usr/local/bin
    curl -fsSL https://bun.sh/install | atl_sudo env BUN_INSTALL=/usr/local bash
    if [[ ! -x /usr/local/bin/bun ]]; then
      local msg
      msg="Bun installation did not produce /usr/local/bin/bun.\n\n"
      msg+="Install manually: https://bun.sh"
      atl_whiptail_msgbox --title "Bun install failed" --msgbox \
        "$msg" 12 70
      exit 1
    fi
    printf '%s' /usr/local/bin/bun
    return 0
  fi
  atl_whiptail_msgbox --title "Bun required" --msgbox \
    "Bun is required for this installation mode." 8 60
  exit 1
}


atl_tcp_reachable() {
  local host="$1" port="$2"
  if command -v nc >/dev/null 2>&1; then
    nc -z -w 3 "$host" "$port" 2>/dev/null
    return $?
  fi
  if command -v timeout >/dev/null 2>&1; then
    timeout 3 bash -c "echo >/dev/tcp/${host}/${port}" 2>/dev/null
    return $?
  fi
  bash -c "echo >/dev/tcp/${host}/${port}" 2>/dev/null
}


## atl_preflight_manual_services
# Validate connectivity for external manual-mode services.
atl_preflight_manual_services() {
  local warnings=() redis_host redis_port minio_host minio_port
  local mongo_host mongo_port mongo_rc

  redis_host="${ENV_VALUES[REDIS_HOST]:-localhost}"
  redis_port="${ENV_VALUES[REDIS_PORT]:-6379}"
  if ! atl_tcp_reachable "$redis_host" "$redis_port"; then
    warnings+=("Redis: cannot reach ${redis_host}:${redis_port}")
  fi

  minio_host="${ENV_VALUES[MINIO_ENDPOINT]:-localhost}"
  minio_port="${ENV_VALUES[MINIO_PORT]:-9000}"
  if ! atl_tcp_reachable "$minio_host" "$minio_port"; then
    warnings+=("MinIO/S3: cannot reach ${minio_host}:${minio_port}")
  elif command -v curl >/dev/null 2>&1; then
    if ! curl -fsS --max-time 5 \
      "http://${minio_host}:${minio_port}/minio/health/live" \
      >/dev/null 2>&1; then
      warnings+=("MinIO/S3: TCP open at ${minio_host}:${minio_port} but health \
check failed")
    fi
  fi

  if [[ -n "${ENV_VALUES[MONGODB_URI]:-}" ]]; then
    if command -v mongosh >/dev/null 2>&1; then
      if ! mongosh "${ENV_VALUES[MONGODB_URI]}" --eval \
        'db.runCommand({ ping: 1 })' --quiet >/dev/null 2>&1; then
        warnings+=("MongoDB: mongosh ping failed for MONGODB_URI")
      fi
    else
      mongo_rc=0
      read -r mongo_host mongo_port \
        < <(atl_mongodb_host_port "${ENV_VALUES[MONGODB_URI]}") \
        || mongo_rc=$?
      if [[ "$mongo_rc" -eq 2 ]]; then
        warnings+=("MongoDB: mongodb+srv URI — install mongosh to verify \
connectivity")
      elif [[ "$mongo_rc" -ne 0 ]]; then
        warnings+=("MongoDB: could not parse host/port from MONGODB_URI")
      elif ! atl_tcp_reachable "$mongo_host" "$mongo_port"; then
        warnings+=("MongoDB: cannot reach ${mongo_host}:${mongo_port}")
      fi
    fi
  fi

  if ((${#warnings[@]} == 0)); then
    return 0
  fi

  local msg="Could not verify one or more external services:\n\n"
  local w
  for w in "${warnings[@]}"; do
    msg+="- ${w}\n"
  done
  msg+="\nFix networking/firewall/credentials, or continue anyway if services "
  msg+="are still starting."

  if atl_whiptail_yesno --title "Connectivity check" --yesno "$msg" 18 78; then
    return 0
  fi
  exit 1
}


atl_systemctl_restart_or_fail() {
  local unit="$1"
  local msg
  if atl_sudo systemctl restart "$unit"; then
    return 0
  fi
  msg="Failed to start ${unit}.\n\nInspect logs with:\n"
  msg+="  sudo journalctl -u ${unit} -n 50 --no-pager\n\n"
  msg+="Fix the issue and run:\n  sudo systemctl restart ${unit}"
  atl_whiptail_msgbox --title "Service start failed" --msgbox \
    "$msg" 16 78
  exit 1
}


## atl_restart_after_config
# Restart services/containers after configuration changes.
# Arguments:
#   $1 mode, $2 install dir.
atl_restart_after_config() {
  local mode="$1" install_dir="$2"
  case "$mode" in
    fullstack)
      if ! atl_docker_compose \
        "${install_dir}/install/docker" docker-compose.fullstack.yml up -d; then
        local msg
        msg="Could not restart the full stack after configuration changes.\n\n"
        msg+="Run manually:\n"
        msg+="  cd ${install_dir}/install/docker\n"
        msg+="  sudo docker compose --env-file ../../.env "
        msg+="-f docker-compose.fullstack.yml up -d"
        atl_whiptail_msgbox --title "Docker restart" --msgbox \
          "$msg" 14 72 || true
      fi
      ;;
    docker | manual)
      if atl_sudo test -f \
        /etc/systemd/system/atlantisboard.service 2>/dev/null; then
        atl_systemctl_restart_or_fail atlantisboard.service || true
        if atl_sudo test -f \
          /etc/systemd/system/atlantisboard-worker.service 2>/dev/null; then
          atl_systemctl_restart_or_fail atlantisboard-worker.service || true
        fi
      fi
      ;;
  esac
}

