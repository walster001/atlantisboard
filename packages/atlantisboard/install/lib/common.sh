#!/usr/bin/env bash
# Shared Whiptail helpers: Atlantisboard theme, validation, secret generation.
# Sourced by setup.sh and reverse-proxy.sh (expects PKG_ROOT, ENV_VALUES, ENV_FIELDS).
set -euo pipefail

atl_apply_theme() {
  # Match default login screen branding (src/shared/types/loginBranding.ts):
  #   background #1f68b5, body text #ffffff, logo highlight #7ccfed for focused controls.
  # label= is required for whiptail --msgbox body text (without it, distro defaults = unreadable).
  local bg accent fg
  fg=white
  if atl_newt_supports_256_colors; then
    bg=color31    # ~#1f68b5 login backgroundColor
    accent=color117 # ~#7ccfed logo light blue (active yes/no, menus)
  else
    bg=blue
    accent=cyan
  fi
  unset NEWT_COLORS_FILE
  export NEWT_COLORS="
root=,${bg}
window=,${bg}
border=${fg},${bg}
shadow=,black
title=${fg},${bg}
roottext=${fg},${bg}
label=${fg},${bg}
textbox=${fg},${bg}
acttextbox=${fg},${bg}
helpline=${fg},${bg}
button=${fg},${bg}
actbutton=black,white
compactbutton=${fg},${bg}
actcompactbutton=black,white
entry=${fg},${bg}
actentry=black,${accent}
disentry=,${bg}
listbox=${fg},${bg}
actlistbox=black,${accent}
sellslistbox=${fg},${bg}
actsellistbox=black,${accent}
checkbox=${fg},${bg}
actcheckbox=black,${accent}
"
}

atl_newt_supports_256_colors() {
  case "${TERM:-}" in
    *256* | *-color | screen* | tmux* | xterm* | alacritty* | foot* | wezterm* | rxvt* | contour* | kitty* )
      return 0
      ;;
  esac
  case "${COLORTERM:-}" in
    *256* | truecolor )
      return 0
      ;;
  esac
  return 1
}

atl_generate_secret() {
  openssl rand -base64 48 | tr -d '\n'
}

atl_generate_minio_key() {
  # MinIO access keys: 32 hex chars (productionSecrets MIN_SECRET_LENGTH=32).
  openssl rand -hex 16
}

atl_url_encode() {
  local length="${#1}" i c
  for (( i=0; i<length; i++ )); do
    c="${1:i:1}"
    case "$c" in
      [a-zA-Z0-9.~_-]) printf '%s' "$c" ;;
      *) printf '%%%02X' "'$c" ;;
    esac
  done
}

atl_require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    atl_whiptail_msgbox --title "Missing prerequisite" --msgbox \
      "Required command not found: $1\n\nInstall it and run atlantisboard-setup again." 12 60
    exit 1
  fi
}

atl_get_install_user() {
  logname 2>/dev/null || echo "${SUDO_USER:-${USER:-root}}"
}

# Run commands with root privileges (/opt install, systemd, Docker without group membership).
atl_sudo() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

atl_ensure_sudo_credentials() {
  if [[ "$(id -u)" -eq 0 ]]; then
    return 0
  fi
  if sudo -n true 2>/dev/null; then
    return 0
  fi
  local tty
  tty="$(atl_whiptail_tty)"
  if [[ "$tty" != "/dev/null" ]]; then
    sudo -v </dev/tty >/dev/tty 2>&1
    return $?
  fi
  sudo -v >/dev/null 2>&1
}

atl_require_sudo_access() {
  if [[ "$(id -u)" -eq 0 ]]; then
    return 0
  fi
  if ! atl_ensure_sudo_credentials; then
    atl_whiptail_display --title "Administrator access required" --msgbox \
      "Atlantisboard setup installs to system paths (for example /opt/atlantisboard) and needs administrator privileges.\n\nRun:\n  sudo ./atlantisboard-setup\n\nOr enter your password when sudo prompts in the terminal." \
      14 72 || true
    exit 1
  fi
}

atl_whiptail_tty() {
  if [[ -e /dev/tty ]] && (: </dev/tty >/dev/tty) 2>/dev/null; then
    printf '%s' /dev/tty
    return 0
  fi
  printf '%s' /dev/null
}

# Whiptail draws widgets on stdout and prints the chosen value on stderr (see whiptail(1)).
# Capture stderr in a fresh temp file each call; never use 3>&2 1>&2 (values accumulate across prompts).
atl_whiptail_capture() {
  local tmp tty
  tmp="$(mktemp)"
  tty="$(atl_whiptail_tty)"
  if [[ "$tty" != "/dev/null" ]]; then
    if command whiptail "$@" </dev/tty 2>"$tmp" 1>"$tty"; then
      atl_sanitize_input "$(tr -d '\r' <"$tmp")"
      rm -f "$tmp"
      return 0
    fi
  elif command whiptail "$@" 2>"$tmp" 1>"$tty"; then
    atl_sanitize_input "$(tr -d '\r' <"$tmp")"
    rm -f "$tmp"
    return 0
  fi
  rm -f "$tmp"
  return 1
}

atl_whiptail_display() {
  local tty rc=0
  tty="$(atl_whiptail_tty)"
  if [[ "$tty" != "/dev/null" ]]; then
    command whiptail "$@" </dev/tty 1>"$tty" 2>"$tty" || rc=$?
  else
    command whiptail "$@" 1>"$tty" 2>"$tty" || rc=$?
  fi
  return "$rc"
}

# Prefer these over raw whiptail — raw calls break Tab/Enter on yes/no under sudo (stdin is not /dev/tty).
atl_whiptail_yesno() {
  atl_whiptail_display "$@"
}

atl_whiptail_msgbox() {
  atl_whiptail_display "$@"
}

atl_whiptail_infobox() {
  atl_whiptail_display "$@"
}

atl_extract_domain_from_url() {
  local url host
  url="$(atl_sanitize_input "$1")"
  [[ -z "$url" ]] && return 1
  url="${url#*://}"
  host="${url%%/*}"
  host="${host%%:*}"
  host="${host%%\?*}"
  host="${host,,}"
  [[ -n "$host" ]] || return 1
  printf '%s' "$host"
}

atl_app_url_is_local() {
  local host
  host="$(atl_extract_domain_from_url "${1:-}")" || return 0
  case "$host" in
    localhost | 127.0.0.1 | ::1 | 0.0.0.0)
      return 0
      ;;
    *.local)
      return 0
      ;;
  esac
  return 1
}

atl_sudo_mkdir_p() {
  local dir="$1"
  dir="$(atl_sanitize_input "$dir")"
  dir="${dir%/}"
  if [[ -z "$dir" ]]; then
    atl_whiptail_msgbox --title "Invalid path" --msgbox \
      "A directory path is required but was empty.\n\nThis usually means the installer did not receive a valid path from the prompts." \
      12 72 || true
    return 1
  fi
  atl_assert_absolute_path "$dir" "directory" || return 1
  atl_sudo mkdir -p "$dir"
}

atl_assert_absolute_path() {
  local path="$1" label="${2:-path}"
  path="$(atl_sanitize_input "$path")"
  path="${path%/}"
  if [[ -z "$path" ]] || [[ "$path" != /* ]] || [[ "$path" == "/" ]]; then
    atl_whiptail_msgbox --title "Invalid path" --msgbox \
      "The ${label} is missing or invalid.\n\nUse an absolute path such as /opt/atlantisboard (not empty or /)." \
      12 72
    return 1
  fi
  return 0
}

atl_finalize_install_dir() {
  INSTALL_DIR="$(atl_sanitize_input "$INSTALL_DIR")"
  INSTALL_DIR="${INSTALL_DIR%/}"
  if [[ -z "$INSTALL_DIR" ]]; then
    INSTALL_DIR="/opt/atlantisboard"
  fi
  atl_assert_absolute_path "$INSTALL_DIR" "install directory" || exit 1
}

atl_normalize_backup_dir() {
  local raw="${1:-/var/backups/atlantisboard}"
  raw="$(atl_sanitize_input "$raw")"
  if [[ -z "$raw" ]]; then
    raw="/var/backups/atlantisboard"
  fi
  raw="${raw%/}"
  printf '%s' "$raw"
}

atl_env_get() {
  local key="$1" default="$2" value
  value="${ENV_VALUES[$key]:-}"
  if [[ -z "$value" ]]; then
    value="$default"
  fi
  printf '%s' "$value"
}

# Read a single KEY=value from the install .env on disk (authoritative after atl_write_env_file).
atl_env_get_from_file() {
  local key="$1" env_file="$2"
  local line value
  [[ -n "$key" && -n "$env_file" ]] || return 1
  atl_sudo test -f "$env_file" 2>/dev/null || return 1
  line="$(atl_sudo grep -E "^${key}=" "$env_file" 2>/dev/null | tail -1 || true)"
  [[ -n "$line" ]] || return 1
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "$value" =~ ^\"(.*)\"$ ]]; then
    value="${BASH_REMATCH[1]}"
  elif [[ "$value" =~ ^\'(.*)\'$ ]]; then
    value="${BASH_REMATCH[1]}"
  fi
  [[ -n "$value" ]] || return 1
  printf '%s' "$value"
}

atl_path_is_safe_absolute() {
  local val="$1"
  [[ "$val" == /* ]] || return 1
  [[ "$val" != "/" ]] || return 1
  [[ "$val" != *$'\n'* ]] || return 1
  [[ "$val" != *"://"* ]] || return 1
  [[ "$val" != *"mongodb"* ]] || return 1
  [[ "${#val}" -le 512 ]] || return 1
  return 0
}

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
        # Ubuntu/Debian universe: docker-compose-v2 (not docker-compose-plugin from Docker CE repo).
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
        if ! atl_sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y "$pkg"; then
          install_ok=false
          echo "atlantisboard-setup: warning: package install failed: ${pkg}" >&2
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
  echo "atlantisboard-setup: installing whiptail (required for the installer)..." >&2
  echo "atlantisboard-setup: sudo may prompt for your password." >&2
  atl_ensure_sudo_credentials || return 1
  atl_install_prerequisite_cmd whiptail "$pm" || return 1
  atl_cmd_exists whiptail
}

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
  if ! curl -fsSL https://download.docker.com/linux/ubuntu/gpg | atl_sudo tee /etc/apt/keyrings/docker.asc >/dev/null; then
    return 1
  fi
  atl_sudo chmod a+r /etc/apt/keyrings/docker.asc
  local codename fallback
  codename="$(atl_os_release_codename)" || codename=noble
  for fallback in "$codename" noble bookworm; do
    [[ -n "$fallback" ]] || continue
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${fallback} stable" \
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
      pkg_line="$(atl_prereq_packages_for_cmd docker-compose-plugin apt)" || return 1
      read -r -a candidates <<<"$pkg_line"
      candidates+=(docker-compose-plugin)
      for pkg in "${candidates[@]}"; do
        [[ -n "$pkg" ]] || continue
        if ! atl_apt_package_available "$pkg"; then
          continue
        fi
        echo "atlantisboard-setup: installing ${pkg}..." >&2
        atl_pkg_install_packages apt "$pkg" || continue
        if atl_docker_compose_works; then
          return 0
        fi
      done
      echo "atlantisboard-setup: trying Docker official apt repository for Compose..." >&2
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
    echo "atlantisboard-setup: installing ${pkgs[*]}..." >&2
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

atl_install_port_check_tools() {
  local pm="$1"
  if atl_cmd_exists ss || atl_cmd_exists nc; then
    return 0
  fi
  atl_install_prerequisite_cmd ss "$pm" || atl_install_prerequisite_cmd nc "$pm" || return 1
}

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

  if [[ ${#missing_cmds[@]} -eq 0 && "$need_docker" != true && "$need_port_tools" != true && "$need_curl" != true ]]; then
    return 0
  fi

  local msg="The installer can try to install missing packages using ${pm}:\n\n"
  local item
  for item in "${missing_labels[@]}"; do
    msg+="- ${item}\n"
  done
  msg+="\nThis requires administrator privileges. Continue?"

  if ! atl_whiptail_display --title "Install prerequisites" --yesno "$msg" 14 78; then
    return 0
  fi

  if ! atl_ensure_sudo_credentials; then
    atl_whiptail_display --title "Administrator access" --msgbox \
      "Could not obtain sudo privileges.\n\nRun:\n  sudo ./atlantisboard-setup\n\nOr enter your password when sudo prompts in this terminal." \
      14 72 || true
    return 0
  fi

  echo "atlantisboard-setup: installing prerequisites via ${pm} (sudo may prompt again)..." >&2

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

atl_preflight_fail() {
  local message="$1"
  atl_whiptail_display --title "Preflight check failed" --msgbox \
    "Some prerequisites are missing or failed:\n\n${message}\n\nFix these issues and run atlantisboard-setup again." \
    22 78 || true
  exit 1
}

atl_verify_app_port() {
  local mode="${1:-manual}"
  local -a lines=()
  local app_port="${ENV_VALUES[PORT]:-3000}"
  local port_status=0

  atl_port_listening "$app_port" || port_status=$?
  if [[ $port_status -eq 0 ]]; then
    lines+=("Port ${app_port} is already in use — stop the service using it or choose another PORT")
  elif [[ $port_status -eq 2 ]]; then
    lines+=("Cannot check port ${app_port} — install ss (iproute2) or nc (netcat)")
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
            lines+=("Port ${dep_port} is already in use — required for MongoDB, Redis, or MinIO containers")
          elif [[ $port_status -eq 2 ]]; then
            lines+=("Cannot check port ${dep_port} — install ss (iproute2) or nc (netcat)")
          fi
        done
      fi
      ;;
  esac

  if [[ ${#lines[@]} -gt 0 ]]; then
    atl_preflight_fail "$(printf '%s\n\n' "${lines[@]}")"
  fi
}

atl_preflight_check() {
  local mode="$1"
  local -a lines=()
  local line

  atl_offer_install_prerequisites "$mode"

  for cmd in whiptail openssl jq rsync bash; do
    if ! atl_cmd_exists "$cmd"; then
      case "$cmd" in
        whiptail) line="whiptail — install: sudo apt install whiptail (Debian/Ubuntu) or sudo dnf install newt (Fedora)" ;;
        openssl) line="openssl — install: sudo apt install openssl or sudo dnf install openssl" ;;
        jq) line="jq — install: sudo apt install jq or sudo dnf install jq" ;;
        rsync) line="rsync — install: sudo apt install rsync or sudo dnf install rsync" ;;
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
  if ! atl_sudo mkdir -p "$(dirname "$INSTALL_DIR")" 2>/dev/null; then
    lines+=("Cannot create install path parent $(dirname "$INSTALL_DIR") — run with sudo")
  fi

  case "$mode" in
    docker | fullstack)
      if ! atl_cmd_exists docker; then
        lines+=("docker — install Docker Engine: https://docs.docker.com/engine/install/")
      elif ! atl_docker_compose_works; then
        lines+=("docker compose v2 — install: sudo apt install docker-compose-v2 (Ubuntu/Debian) or docker-compose-plugin from Docker’s apt repo; verify with: sudo docker compose version")
      fi
      ;;
  esac

  case "$mode" in
    docker | manual)
      if ! atl_cmd_exists bun; then
        if ! atl_cmd_exists curl; then
          lines+=("bun — not found; install Bun (https://bun.sh) or install curl to fetch the Bun installer")
        elif ! curl -fsSL --connect-timeout 10 --max-time 20 https://bun.sh/install -o /dev/null 2>/dev/null; then
          lines+=("bun — not found and https://bun.sh is unreachable — install Bun manually or fix network access")
        fi
      fi
      ;;
  esac

  if [[ ${#lines[@]} -gt 0 ]]; then
    atl_preflight_fail "$(printf '%s\n\n' "${lines[@]}")"
  fi
}

atl_require_systemctl() {
  if ! atl_cmd_exists systemctl; then
    atl_whiptail_msgbox --title "systemd unavailable" --msgbox \
      "systemctl was not found on this system.\n\nAutomatic startup via systemd is only supported on Linux systems with systemd.\n\nSkip systemd setup and start Atlantisboard manually." \
      14 72
    return 1
  fi
  return 0
}

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
    "Bun is required but was not found.\n\nInstall Bun to /usr/local/bin so the atlantisboard systemd user can run it (ProtectHome=true)?" \
    12 72; then
    atl_whiptail_infobox --title "Installing Bun" --infobox \
      "Downloading and installing Bun to /usr/local ...\n\nPlease wait." 8 60
    atl_sudo mkdir -p /usr/local/bin
    curl -fsSL https://bun.sh/install | atl_sudo env BUN_INSTALL=/usr/local bash
    if [[ ! -x /usr/local/bin/bun ]]; then
      atl_whiptail_msgbox --title "Bun install failed" --msgbox \
        "Bun installation did not produce /usr/local/bin/bun.\n\nInstall manually: https://bun.sh" \
        12 70
      exit 1
    fi
    printf '%s' /usr/local/bin/bun
    return 0
  fi
  atl_whiptail_msgbox --title "Bun required" --msgbox "Bun is required for this installation mode." 8 60
  exit 1
}

atl_docker_existing_stack_detected() {
  local mode="$1"
  local -a containers=()
  case "$mode" in
    docker)
      containers=(atlantisboard-mongodb-deps atlantisboard-redis-deps atlantisboard-minio-deps)
      ;;
    fullstack)
      containers=(atlantisboard-mongodb-full atlantisboard-redis-full atlantisboard-minio-full atlantisboard-app-full)
      ;;
    *) return 1 ;;
  esac

  local name
  for name in "${containers[@]}"; do
    if atl_sudo docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$name"; then
      return 0
    fi
  done

  if atl_sudo docker volume ls --format '{{.Name}}' 2>/dev/null | grep -qE '(^|_)(mongo-data|redis-data|minio-data)(-full)?$'; then
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
    for key in REDIS_PASSWORD MONGODB_APP_PASSWORD MONGODB_ROOT_PASSWORD MINIO_SECRET_KEY MINIO_ACCESS_KEY MINIO_ROOT_SECRET_KEY MINIO_ROOT_ACCESS_KEY; do
      [[ -n "${ENV_VALUES[$key]:-}" ]] || continue
      old_val="$(grep -E "^${key}=" "$prior_env" 2>/dev/null | tail -1 | cut -d= -f2- || true)"
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

  if ! atl_whiptail_yesno --title "Existing Docker data" --yesno \
    "Existing Docker containers or volumes were found for this stack.\n\nNew secrets in .env may not match passwords already stored in those volumes (Redis, MongoDB, MinIO). Continuing often causes authentication failures.${extra}\n\nTo reset data: install/docker/reset-docker-data.sh ${mode}\n\nContinue anyway?" \
    18 78; then
    exit 1
  fi
}

atl_wait_for_docker_deps() {
  local mode="$1"
  local timeout="${2:-120}"
  local start now elapsed
  start="$(date +%s)"

  atl_whiptail_infobox --title "Starting dependencies" --infobox \
    "Waiting for MongoDB replica set, Redis, and MinIO to become ready...\n\nThis can take up to ${timeout} seconds on first run." \
    10 70

  while true; do
    now="$(date +%s)"
    elapsed=$((now - start))
    if (( elapsed >= timeout )); then
      atl_whiptail_msgbox --title "Dependency timeout" --msgbox \
        "Timed out after ${timeout}s waiting for Docker dependencies.\n\nCheck container logs, e.g.:\n  cd ${INSTALL_DIR}/install/docker && docker compose ps" \
        14 72 || true
      return 1
    fi

    local mongo_ok=false redis_ok=false minio_ok=false

    case "$mode" in
      docker)
        if [[ -n "${ENV_VALUES[MONGODB_URI]:-}" ]] && command -v mongosh >/dev/null 2>&1; then
          if mongosh "${ENV_VALUES[MONGODB_URI]}" --quiet --eval \
            'try { quit(rs.status().ok === 1 ? 0 : 1) } catch (e) { quit(1) }' >/dev/null 2>&1; then
            mongo_ok=true
          fi
        elif atl_sudo docker exec atlantisboard-mongodb-deps mongosh --quiet \
          -u "${ENV_VALUES[MONGODB_ROOT_USER]}" -p "${ENV_VALUES[MONGODB_ROOT_PASSWORD]}" \
          --authenticationDatabase admin \
          --eval "try { quit(rs.status().ok === 1 ? 0 : 1) } catch (e) { quit(1) }" >/dev/null 2>&1; then
          mongo_ok=true
        fi
        if atl_sudo docker exec atlantisboard-redis-deps redis-cli -a "${ENV_VALUES[REDIS_PASSWORD]}" ping 2>/dev/null | grep -q PONG; then
          redis_ok=true
        fi
        if curl -sf http://127.0.0.1:9000/minio/health/live >/dev/null 2>&1; then
          minio_ok=true
        fi
        ;;
      fullstack)
        if atl_sudo docker exec atlantisboard-mongodb-full mongosh --quiet \
          -u "${ENV_VALUES[MONGODB_ROOT_USER]}" -p "${ENV_VALUES[MONGODB_ROOT_PASSWORD]}" \
          --authenticationDatabase admin \
          --eval "try { quit(rs.status().ok === 1 ? 0 : 1) } catch (e) { quit(1) }" >/dev/null 2>&1; then
          mongo_ok=true
        fi
        if atl_sudo docker exec atlantisboard-redis-full redis-cli -a "${ENV_VALUES[REDIS_PASSWORD]}" ping 2>/dev/null | grep -q PONG; then
          redis_ok=true
        fi
        if atl_sudo docker exec atlantisboard-minio-full curl -sf http://localhost:9000/minio/health/live >/dev/null 2>&1; then
          minio_ok=true
        fi
        ;;
    esac

    if [[ "$mongo_ok" == true && "$redis_ok" == true && "$minio_ok" == true ]]; then
      return 0
    fi
    sleep 2
  done
}

atl_systemctl_restart_or_fail() {
  local unit="$1"
  if atl_sudo systemctl restart "$unit"; then
    return 0
  fi
  atl_whiptail_msgbox --title "Service start failed" --msgbox \
    "Failed to start ${unit}.\n\nInspect logs with:\n  sudo journalctl -u ${unit} -n 50 --no-pager\n\nFix the issue and run:\n  sudo systemctl restart ${unit}" \
    16 78
  exit 1
}

atl_sanitize_input() {
  local val="$1"
  val="${val//$'\r'/}"
  val="${val//\"/}"
  val="${val//\'/}"
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%"${val##*[![:space:]]}"}"
  printf '%s' "$val"
}

atl_validate_value() {
  local val="$1" vtype="${2:-}" optional="${3:-false}"
  val="$(atl_sanitize_input "$val")"

  if [[ -z "$val" ]]; then
    [[ "$optional" == "true" ]] && return 0
    return 1
  fi

  case "$vtype" in
    "" | text) return 0 ;;
    port)
      [[ "$val" =~ ^[0-9]+$ ]] || return 1
      (( val >= 1 && val <= 65535 ))
      ;;
    url)
      [[ "$val" =~ ^https?://[^[:space:]]+$ ]]
      ;;
    cors)
      local part
      IFS=',' read -ra parts <<<"$val"
      for part in "${parts[@]}"; do
        part="${part#"${part%%[![:space:]]*}"}"
        part="${part%"${part##*[![:space:]]}"}"
        [[ -n "$part" ]] || return 1
        [[ "$part" =~ ^https?://[^[:space:]]+$ ]] || return 1
      done
      ;;
    boolean)
      val="${val,,}"
      [[ "$val" == "true" || "$val" == "false" ]]
      ;;
    path_absolute)
      atl_path_is_safe_absolute "$val"
      ;;
    host)
      [[ "$val" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]*$ ]]
      ;;
    domain)
      [[ "$val" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]]
      ;;
    mongodb_uri)
      [[ "$val" =~ ^mongodb(\+srv)?:// ]]
      ;;
    install_dir)
      atl_path_is_safe_absolute "$val" && [[ "$val" != *" "* ]]
      ;;
    google_client_id)
      [[ "$val" =~ \.apps\.googleusercontent\.com$ ]]
      ;;
    proxy_hops)
      [[ "$val" =~ ^[0-9]+$ ]] && (( val >= 0 && val <= 10 ))
      ;;
    max_body_mb | positive_int)
      [[ "$val" =~ ^[0-9]+$ ]] || return 1
      (( val >= 1 && val <= 10240 ))
      ;;
    email)
      [[ "$val" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]
      ;;
    *)
      return 0
      ;;
  esac
}

atl_validation_message() {
  local vtype="$1"
  case "$vtype" in
    port) echo "Enter a number between 1 and 65535." ;;
    url) echo "Enter a full URL starting with http:// or https:// (no spaces)." ;;
    cors) echo "Enter one or more URLs separated by commas (http:// or https://)." ;;
    boolean) echo "Enter exactly true or false." ;;
    path_absolute) echo "Enter one absolute path starting with / (no URLs or other settings pasted in)." ;;
    host) echo "Enter a hostname (letters, numbers, dots, hyphens)." ;;
    domain) echo "Enter a public domain name (e.g. boards.example.com)." ;;
    mongodb_uri) echo "Enter a MongoDB URI starting with mongodb:// or mongodb+srv://." ;;
    install_dir) echo "Enter an absolute install path (e.g. /opt/atlantisboard)." ;;
    google_client_id) echo "Paste your Google OAuth Client ID (*.apps.googleusercontent.com)." ;;
    proxy_hops) echo "Enter a number from 0 to 10 (use 1 behind Nginx or Caddy)." ;;
    max_body_mb | positive_int) echo "Enter a whole number from 1 to 10240 (megabytes)." ;;
    email) echo "Enter a valid email address." ;;
    *) echo "That value is not valid. Please try again." ;;
  esac
}

atl_field_applies_to_mode() {
  local field_json="$1" mode="$2"
  local applies hide_for
  applies="$(jq -r '.applies_to // empty | if length == 0 then "all" else join(" ") end' <<<"$field_json")"
  hide_for="$(jq -r '.hide_for // empty | join(" ")' <<<"$field_json")"

  if [[ -n "$hide_for" && " $hide_for " == *" $mode "* ]]; then
    return 1
  fi
  if [[ "$applies" == "all" ]]; then
    return 0
  fi
  [[ " $applies " == *" $mode "* ]]
}

atl_section_applies_to_mode() {
  local section_json="$1" mode="$2"
  local applies
  applies="$(jq -r '.applies_to // empty | if length == 0 then "all" else join(" ") end' <<<"$section_json")"
  if [[ "$applies" == "all" ]]; then
    return 0
  fi
  [[ " $applies " == *" $mode "* ]]
}

atl_section_prompt_enabled() {
  local section_json="$1"
  [[ "$(jq -r '.prompt // true' <<<"$section_json")" != "false" ]]
}

atl_section_has_promptable_fields() {
  local section_json="$1" mode="$2"
  local field auto_gen
  while IFS= read -r field; do
    atl_field_applies_to_mode "$field" "$mode" || continue
    auto_gen="$(jq -r '.auto_generate // false' <<<"$field")"
    [[ "$auto_gen" != "true" ]] && return 0
  done < <(jq -c '.fields[]' <<<"$section_json")
  return 1
}

atl_count_auto_generate_fields() {
  local mode="$1" count=0
  local field
  [[ -f "$ENV_FIELDS" ]] && command -v jq >/dev/null 2>&1 || {
    printf '0'
    return 0
  }
  while IFS= read -r field; do
    atl_field_applies_to_mode "$field" "$mode" || continue
    [[ "$(jq -r '.auto_generate // false' <<<"$field")" == "true" ]] && count=$((count + 1))
  done < <(jq -c '.sections[].fields[]' "$ENV_FIELDS")
  printf '%s' "$count"
}

atl_generate_install_secrets() {
  local mode="$1" count
  [[ -f "$ENV_FIELDS" ]] && command -v jq >/dev/null 2>&1 || return 0
  count="$(atl_count_auto_generate_fields "$mode")"
  atl_whiptail_display --title "Security" --infobox \
    "Generating all keys and passwords...\n\nCreating ${count} secure random values.\n\nSecrets are never shown on screen." \
    10 72
  atl_auto_generate_secrets "$mode"
}

atl_prompt_validated() {
  local key="$1" label="$2" desc="$3" default="$4" secret="$5" optional="$6" vtype="$7"
  local current prompt_text err_msg valid=false

  while [[ "$valid" != true ]]; do
    current="${ENV_VALUES[$key]:-$default}"
    prompt_text="${label}\n\n${desc}"
    if [[ "$optional" == "true" ]]; then
      prompt_text="${prompt_text}\n\n(Optional — leave blank to skip.)"
    fi

    if [[ "$secret" == "true" ]]; then
      # Never pre-fill password boxes (avoids flashing generated or existing secrets).
      current="$(atl_whiptail_capture --passwordbox "$prompt_text" 14 78 "")" || return 1
    else
      current="$(atl_whiptail_capture --inputbox "$prompt_text" 14 78 "$current")" || return 1
    fi
    current="$(atl_sanitize_input "$current")"

    if atl_validate_value "$current" "$vtype" "$optional"; then
      if [[ "$vtype" == "boolean" ]]; then
        current="${current,,}"
      fi
      ENV_VALUES["$key"]="$current"
      valid=true
    else
      err_msg="$(atl_validation_message "$vtype")"
      atl_whiptail_display --title "Invalid input" --msgbox "${label}\n\n${err_msg}" 12 70 || true
    fi
  done
}

atl_auto_generate_secrets() {
  local mode="${1:-manual}"
  [[ -f "$ENV_FIELDS" ]] && command -v jq >/dev/null 2>&1 || return 0

  local field key gen_type
  while IFS= read -r field; do
    atl_field_applies_to_mode "$field" "$mode" || continue
    key="$(jq -r '.key' <<<"$field")"
    if [[ "$(jq -r '.auto_generate // false' <<<"$field")" != "true" ]]; then
      continue
    fi
    gen_type="$(jq -r '.generate_type // "secret"' <<<"$field")"
    case "$gen_type" in
      minio_key) ENV_VALUES["$key"]="$(atl_generate_minio_key)" ;;
      *) ENV_VALUES["$key"]="$(atl_generate_secret)" ;;
    esac
  done < <(jq -c '.sections[].fields[]' "$ENV_FIELDS")

  # MEDIA_SIGN_SECRET must differ from JWT_SECRET.
  if [[ -n "${ENV_VALUES[JWT_SECRET]:-}" && -n "${ENV_VALUES[MEDIA_SIGN_SECRET]:-}" ]]; then
    if [[ "${ENV_VALUES[MEDIA_SIGN_SECRET]}" == "${ENV_VALUES[JWT_SECRET]}" ]]; then
      ENV_VALUES["MEDIA_SIGN_SECRET"]="$(atl_generate_secret)"
    fi
  fi
}

atl_prompt_env_fields() {
  local mode="$1"
  [[ -f "$ENV_FIELDS" ]] && command -v jq >/dev/null 2>&1 || {
    atl_whiptail_display --title "Setup" --msgbox \
      "jq not found; only auto-generated secrets and defaults will be used.\n\nInstall jq for the full setup experience." \
      10 70 || true
    return 0
  }

  local section title intro field key label desc default secret optional vtype auto_gen
  while IFS= read -r section; do
    atl_section_applies_to_mode "$section" "$mode" || continue
    atl_section_prompt_enabled "$section" || continue
    atl_section_has_promptable_fields "$section" "$mode" || continue
    title="$(jq -r '.title' <<<"$section")"
    intro="$(jq -r '.intro // empty' <<<"$section")"
    mapfile -t fields < <(jq -c '.fields[]' <<<"$section")
    local section_intro="$intro"
    local first_promptable=true
    for field in "${fields[@]}"; do
      atl_field_applies_to_mode "$field" "$mode" || continue
      key="$(jq -r '.key' <<<"$field")"
      auto_gen="$(jq -r '.auto_generate // false' <<<"$field")"
      if [[ "$auto_gen" == "true" ]]; then
        continue
      fi
      label="$(jq -r '.label' <<<"$field")"
      desc="$(jq -r '.description' <<<"$field")"
      if [[ "$first_promptable" == true && -n "$section_intro" ]]; then
        desc="${section_intro}\n\n${desc}"
        first_promptable=false
      fi
      default="$(jq -r '.default' <<<"$field")"
      secret="$(jq -r '.secret // false' <<<"$field")"
      optional="$(jq -r '.optional // false' <<<"$field")"
      vtype="$(jq -r '.validation // empty' <<<"$field")"
      atl_prompt_validated "$key" "$label" "$desc" "$default" "$secret" "$optional" "$vtype" || exit 1
      first_promptable=false
    done
  done < <(jq -c '.sections[]' "$ENV_FIELDS")
}

atl_build_mongodb_uri() {
  local user="$1" pass="$2" host="$3" db="${4:-kanboard}"
  local enc_user enc_pass
  enc_user="$(atl_url_encode "$user")"
  enc_pass="$(atl_url_encode "$pass")"
  printf 'mongodb://%s:%s@%s:27017/%s?authSource=%s&replicaSet=rs0' \
    "$enc_user" "$enc_pass" "$host" "$db" "$db"
}

atl_apply_pompelmi_defaults() {
  local mode="$1"
  ENV_VALUES["POMPELMI_SKIP_SCAN"]="false"
  case "$mode" in
    fullstack)
      ENV_VALUES["POMPELMI_CLAMD_HOST"]="clamav"
      ENV_VALUES["POMPELMI_CLAMD_PORT"]="3310"
      ;;
    docker)
      ENV_VALUES["POMPELMI_CLAMD_HOST"]="127.0.0.1"
      ENV_VALUES["POMPELMI_CLAMD_PORT"]="3310"
      ;;
    manual)
      ENV_VALUES["POMPELMI_CLAMD_HOST"]="${ENV_VALUES[POMPELMI_CLAMD_HOST]:-127.0.0.1}"
      ENV_VALUES["POMPELMI_CLAMD_PORT"]="${ENV_VALUES[POMPELMI_CLAMD_PORT]:-3310}"
      ;;
  esac
}

atl_sync_cors_with_app_url() {
  local app_url="${ENV_VALUES[APP_URL]:-}"
  local cors="${ENV_VALUES[CORS_ORIGIN]:-}"
  [[ -n "$app_url" ]] || return 0
  if [[ -z "$cors" || "$cors" != "$app_url" ]]; then
    ENV_VALUES["CORS_ORIGIN"]="$app_url"
  fi
}

atl_url_origin() {
  local url
  url="$(atl_sanitize_input "$1")"
  [[ -z "$url" ]] && return 1
  url="${url%%\#*}"
  url="${url%%\?*}"
  if [[ "$url" =~ ^(https?://[^/]+) ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}

atl_validate_google_oauth_config() {
  [[ -n "${ENV_VALUES[GOOGLE_CLIENT_ID]:-}" ]] || return 0

  local app_origin oauth_origin
  app_origin="$(atl_url_origin "${ENV_VALUES[APP_URL]:-}")" || app_origin=""

  if [[ -z "${ENV_VALUES[GOOGLE_OAUTH_BROWSER_ORIGIN]:-}" ]]; then
    if [[ -n "$app_origin" ]]; then
      ENV_VALUES["GOOGLE_OAUTH_BROWSER_ORIGIN"]="$app_origin"
    fi
  fi

  while true; do
    oauth_origin="$(atl_url_origin "${ENV_VALUES[GOOGLE_OAUTH_BROWSER_ORIGIN]:-}")" || oauth_origin=""
    if [[ -z "$oauth_origin" ]]; then
      atl_whiptail_msgbox --title "Google sign-in" --msgbox \
        "Google OAuth browser origin is required when a Client ID is set.\n\nEnter the origin users open in the browser (e.g. https://boards.example.com)." \
        12 72 || true
      atl_prompt_validated "GOOGLE_OAUTH_BROWSER_ORIGIN" \
        "Google OAuth browser origin" \
        "Must match an authorized redirect origin in Google Cloud Console." \
        "${app_origin:-https://boards.example.com}" "false" "false" "url" || exit 1
      continue
    fi
    ENV_VALUES["GOOGLE_OAUTH_BROWSER_ORIGIN"]="$oauth_origin"
    if [[ -n "$app_origin" && "$oauth_origin" != "$app_origin" ]]; then
      atl_whiptail_msgbox --title "Google sign-in" --msgbox \
        "Google OAuth browser origin must match your public site URL origin.\n\nAPP_URL origin: ${app_origin}\nOAuth origin: ${oauth_origin}\n\nUpdate one of them so they match." \
        14 72 || true
      atl_prompt_validated "GOOGLE_OAUTH_BROWSER_ORIGIN" \
        "Google OAuth browser origin" \
        "Use the same scheme and host as APP_URL (path is stripped automatically)." \
        "$app_origin" "false" "false" "url" || exit 1
      continue
    fi
    break
  done
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

atl_mongodb_host_port() {
  local uri="$1" rest hostport host port
  uri="$(atl_sanitize_input "$uri")"
  [[ "$uri" =~ ^mongodb(\+srv)?:// ]] || return 1
  if [[ "$uri" == mongodb+srv://* ]]; then
    return 2
  fi
  rest="${uri#mongodb://}"
  if [[ "$rest" == *@* ]]; then
    rest="${rest#*@}"
  fi
  hostport="${rest%%/*}"
  hostport="${hostport%%\?*}"
  if [[ "$hostport" == *:* ]]; then
    host="${hostport%%:*}"
    port="${hostport#*:}"
  else
    host="$hostport"
    port="27017"
  fi
  [[ -n "$host" && -n "$port" ]] || return 1
  printf '%s %s' "$host" "$port"
}

atl_preflight_manual_services() {
  local warnings=() redis_host redis_port minio_host minio_port mongo_host mongo_port mongo_rc

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
    if ! curl -fsS --max-time 5 "http://${minio_host}:${minio_port}/minio/health/live" >/dev/null 2>&1; then
      warnings+=("MinIO/S3: TCP open at ${minio_host}:${minio_port} but health check failed")
    fi
  fi

  if [[ -n "${ENV_VALUES[MONGODB_URI]:-}" ]]; then
    if command -v mongosh >/dev/null 2>&1; then
      if ! mongosh "${ENV_VALUES[MONGODB_URI]}" --eval 'db.runCommand({ ping: 1 })' --quiet >/dev/null 2>&1; then
        warnings+=("MongoDB: mongosh ping failed for MONGODB_URI")
      fi
    else
      mongo_rc=0
      read -r mongo_host mongo_port < <(atl_mongodb_host_port "${ENV_VALUES[MONGODB_URI]}") || mongo_rc=$?
      if [[ "$mongo_rc" -eq 2 ]]; then
        warnings+=("MongoDB: mongodb+srv URI — install mongosh to verify connectivity")
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
  msg+="\nFix networking/firewall/credentials, or continue anyway if services are still starting."

  if atl_whiptail_yesno --title "Connectivity check" --yesno "$msg" 18 78; then
    return 0
  fi
  exit 1
}

atl_apply_mode_defaults() {
  local mode="$1"
  case "$mode" in
    docker)
      ENV_VALUES["REDIS_HOST"]="localhost"
      ENV_VALUES["MINIO_ENDPOINT"]="localhost"
      ENV_VALUES["MONGODB_ROOT_USER"]="${ENV_VALUES[MONGODB_ROOT_USER]:-kanboard_root}"
      ENV_VALUES["MONGODB_APP_USER"]="${ENV_VALUES[MONGODB_APP_USER]:-kanboard_app}"
      ENV_VALUES["MONGODB_URI"]="$(atl_build_mongodb_uri \
        "${ENV_VALUES[MONGODB_APP_USER]}" \
        "${ENV_VALUES[MONGODB_APP_PASSWORD]}" \
        "localhost" \
        "${ENV_VALUES[MONGODB_DB_NAME]:-kanboard}")"
      ;;
    fullstack)
      ENV_VALUES["REDIS_HOST"]="redis"
      ENV_VALUES["MINIO_ENDPOINT"]="minio"
      ENV_VALUES["HOST"]="0.0.0.0"
      ENV_VALUES["ENABLE_CRON_JOBS_IN_MAIN"]="true"
      ENV_VALUES["MONGODB_ROOT_USER"]="${ENV_VALUES[MONGODB_ROOT_USER]:-kanboard_root}"
      ENV_VALUES["MONGODB_APP_USER"]="${ENV_VALUES[MONGODB_APP_USER]:-kanboard_app}"
      ENV_VALUES["MONGODB_URI"]="$(atl_build_mongodb_uri \
        "${ENV_VALUES[MONGODB_APP_USER]}" \
        "${ENV_VALUES[MONGODB_APP_PASSWORD]}" \
        "mongodb" \
        "${ENV_VALUES[MONGODB_DB_NAME]:-kanboard}")"
      ENV_VALUES["MINIO_ROOT_ACCESS_KEY"]="${ENV_VALUES[MINIO_ROOT_ACCESS_KEY]:-${ENV_VALUES[MINIO_ACCESS_KEY]}}"
      ENV_VALUES["MINIO_ROOT_SECRET_KEY"]="${ENV_VALUES[MINIO_ROOT_SECRET_KEY]:-${ENV_VALUES[MINIO_SECRET_KEY]}}"
      ;;
  esac
  atl_apply_pompelmi_defaults "$mode"
  ENV_VALUES["NODE_ENV"]="${ENV_VALUES[NODE_ENV]:-production}"
}

atl_write_env_file() {
  local env_file="$1"
  local -A merged=()
  local key line tmp

  if atl_sudo test -f "$env_file"; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
        merged["${BASH_REMATCH[1]}"]="${BASH_REMATCH[2]}"
      fi
    done < <(atl_sudo cat "$env_file")
  fi

  for key in "${!ENV_VALUES[@]}"; do
    if [[ -n "$key" ]]; then
      merged["$key"]="${ENV_VALUES[$key]}"
    fi
  done

  tmp="$(mktemp)"
  if atl_sudo test -f "$env_file"; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)= ]]; then
        key="${BASH_REMATCH[1]}"
        if [[ -v merged[$key] ]]; then
          printf '%s=%s\n' "$key" "${merged[$key]}"
          unset "merged[$key]"
        else
          printf '%s\n' "$line"
        fi
      else
        printf '%s\n' "$line"
      fi
    done < <(atl_sudo cat "$env_file") > "$tmp"
  else
    : > "$tmp"
  fi

  for key in "${!merged[@]}"; do
    local val="${merged[$key]}"
    val="${val//$'\n'/}"
    val="${val//$'\r'/}"
    if [[ -n "$key" && -n "$val" ]]; then
      printf '%s=%s\n' "$key" "$val"
    elif [[ -n "$key" ]]; then
      printf '%s=\n' "$key"
    fi
  done >> "$tmp"

  atl_sudo install -m 600 -o root -g root "$tmp" "$env_file"
  rm -f "$tmp"
}

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

atl_docker_compose_run() {
  local compose_dir="$1" compose_file="$2"
  shift 2
  local -a env_args=()
  local log_file="${ATL_DOCKER_COMPOSE_LOG:-}"
  while IFS= read -r line; do
    [[ -n "$line" ]] && env_args+=("$line")
  done < <(atl_docker_compose_env_args "$compose_dir")
  # Avoid Compose Bake when buildx is not installed (Ubuntu docker.io); classic build still works.
  local -a compose_env=(COMPOSE_BAKE=false)
  if [[ -z "$log_file" ]]; then
    log_file="$(mktemp)"
    ATL_DOCKER_COMPOSE_LOG="$log_file"
  else
    : >"$log_file"
  fi
  local rc=0
  if atl_sudo docker compose version >/dev/null 2>&1; then
    (cd "$compose_dir" && atl_sudo env "${compose_env[@]}" docker compose "${env_args[@]}" -f "$compose_file" "$@") \
      >>"$log_file" 2>&1 || rc=$?
  else
    (cd "$compose_dir" && atl_sudo env "${compose_env[@]}" docker-compose "${env_args[@]}" -f "$compose_file" "$@") \
      >>"$log_file" 2>&1 || rc=$?
  fi
  return "$rc"
}

atl_docker_compose_log_excerpt() {
  local log_file="${ATL_DOCKER_COMPOSE_LOG:-}"
  local excerpt=""
  if [[ -n "$log_file" && -f "$log_file" ]]; then
    excerpt="$(tail -n 10 "$log_file" 2>/dev/null | sed 's/\\/\\\\/g' | tr -d '\r' || true)"
  fi
  if [[ -n "$excerpt" ]]; then
    printf '%s' "$excerpt"
  else
    printf '%s' "(no compose output captured — check the terminal scrollback)"
  fi
}

atl_docker_compose_cleanup_log() {
  if [[ -n "${ATL_DOCKER_COMPOSE_LOG:-}" && -f "${ATL_DOCKER_COMPOSE_LOG}" ]]; then
    rm -f "${ATL_DOCKER_COMPOSE_LOG}"
  fi
  ATL_DOCKER_COMPOSE_LOG=""
}

atl_docker_compose() {
  local compose_dir="$1" compose_file="$2"
  shift 2
  local env_file="${ENV_FILE:-}"
  atl_docker_compose_cleanup_log
  if [[ -z "$env_file" ]]; then
    echo "atlantisboard-setup: internal error — ENV_FILE is not set before docker compose" >&2
    return 1
  fi
  if ! atl_sudo test -f "$env_file"; then
    echo "atlantisboard-setup: ${env_file} not found — run setup through .env creation before starting containers" >&2
    return 1
  fi

  local max_attempts=3 attempt=1 delay=15
  while [[ "$attempt" -le "$max_attempts" ]]; do
    if atl_docker_compose_run "$compose_dir" "$compose_file" "$@"; then
      atl_docker_compose_cleanup_log
      return 0
    fi
    if [[ "$attempt" -lt "$max_attempts" ]]; then
      echo "atlantisboard-setup: docker compose failed (attempt ${attempt}/${max_attempts}); retrying in ${delay}s (registry timeouts are common)..." >&2
      sleep "$delay"
      delay=$((delay + 15))
    fi
    attempt=$((attempt + 1))
  done
  echo "atlantisboard-setup: docker compose failed after ${max_attempts} attempts. Check network access to docker.io and retry, or set ATLANTISBOARD_MINIO_IMAGE / ATLANTISBOARD_MINIO_MC_IMAGE in .env to a mirror." >&2
  return 1
}

# Set when compose failed but the user chose to continue (skip dependency health wait).
ATL_DOCKER_COMPOSE_DEFERRED=false

# Run docker compose; on failure show whiptail error and offer to continue setup (e.g. reverse proxy).
# Returns 0 on compose success or if user chooses Continue anyway; exits if user aborts.
atl_docker_compose_or_continue() {
  local compose_dir="$1" compose_file="$2"
  shift 2
  local compose_label="${compose_file}"
  local install_hint="${INSTALL_DIR:-/opt/atlantisboard}"

  if atl_docker_compose "$compose_dir" "$compose_file" "$@"; then
    return 0
  fi

  local excerpt msg
  excerpt="$(atl_docker_compose_log_excerpt)"
  msg="docker compose did not finish successfully.\n\nFile: ${compose_label}\nDirectory: ${compose_dir}\n\nLast output:\n${excerpt}\n\nYou can fix containers later with:\n  cd ${install_hint}/install/docker\n  sudo docker compose --env-file ../../.env -f ${compose_label} logs\n\nContinue setup anyway (HTTPS reverse proxy and remaining steps)?"

  if atl_whiptail_yesno --title "Docker Compose failed" --yesno "$msg" 22 78; then
    ATL_DOCKER_COMPOSE_DEFERRED=true
    atl_docker_compose_cleanup_log
    return 0
  fi

  atl_docker_compose_cleanup_log
  exit 1
}

atl_wait_for_docker_deps_or_continue() {
  local mode="$1"
  local timeout="${2:-120}"
  if [[ "${ATL_DOCKER_COMPOSE_DEFERRED:-false}" == true ]]; then
    return 0
  fi
  if atl_wait_for_docker_deps "$mode" "$timeout"; then
    return 0
  fi
  local msg="Docker dependencies did not become healthy within ${timeout} seconds.\n\nMongoDB, Redis, or MinIO may still be starting or misconfigured.\n\nContinue setup anyway (HTTPS reverse proxy and remaining steps)?"
  if atl_whiptail_yesno --title "Docker health check" --yesno "$msg" 14 78; then
    return 0
  fi
  exit 1
}

atl_restart_after_config() {
  local mode="$1" install_dir="$2"
  case "$mode" in
    fullstack)
      if ! atl_docker_compose "${install_dir}/install/docker" docker-compose.fullstack.yml up -d; then
        atl_whiptail_msgbox --title "Docker restart" --msgbox \
          "Could not restart the full stack after configuration changes.\n\nRun manually:\n  cd ${install_dir}/install/docker\n  sudo docker compose --env-file ../../.env -f docker-compose.fullstack.yml up -d" \
          14 72 || true
      fi
      ;;
    docker | manual)
      if atl_sudo test -f /etc/systemd/system/atlantisboard.service 2>/dev/null; then
        atl_systemctl_restart_or_fail atlantisboard.service || true
        if atl_sudo test -f /etc/systemd/system/atlantisboard-worker.service 2>/dev/null; then
          atl_systemctl_restart_or_fail atlantisboard-worker.service || true
        fi
      fi
      ;;
  esac
}

atl_prompt_install_dir() {
  local default="$1"
  local valid=false current err_msg
  while [[ "$valid" != true ]]; do
    current="$(atl_whiptail_capture --title "Install location" --inputbox \
      "Where should Atlantisboard be installed?\n\nUse an absolute path. Default: ${default}" \
      12 78 "$default")" || exit 1
    current="$(atl_sanitize_input "$current")"
    current="${current%/}"
    if [[ -z "$current" ]]; then
      current="$default"
    fi
    if atl_validate_value "$current" "install_dir" "false"; then
      INSTALL_DIR="${current%/}"
      valid=true
    else
      err_msg="$(atl_validation_message install_dir)"
      atl_whiptail_msgbox --title "Invalid path" --msgbox "${err_msg}\n\nYou entered: ${current:-(empty)}" 12 70 || true
    fi
  done
}
