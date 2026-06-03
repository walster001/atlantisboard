#!/usr/bin/env bash
# Environment, validation, prompting, and install-path helpers.


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
    local msg
    msg="Required command not found: $1\n\n"
    msg+="Install it and run atlantisboard-setup again."
    atl_whiptail_msgbox --title "Missing prerequisite" --msgbox \
      "$msg" 12 60
    exit 1
  fi
}


atl_get_install_user() {
  logname 2>/dev/null || echo "${SUDO_USER:-${USER:-root}}"
}


# Run commands with root privileges
# (/opt install, systemd, Docker without group membership).

## atl_sudo
# Run a command with root privileges when required.
# Arguments:
#   Command and args.
atl_sudo() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}


## atl_ensure_sudo_credentials
# Prime sudo credentials for subsequent privileged operations.
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


## atl_require_sudo_access
# Exit when admin privileges are unavailable.
atl_require_sudo_access() {
  if [[ "$(id -u)" -eq 0 ]]; then
    return 0
  fi
  if ! atl_ensure_sudo_credentials; then
    local msg
    msg="Atlantisboard setup installs to system paths "
    msg+="(for example /opt/atlantisboard) and needs "
    msg+="administrator privileges.\n\n"
    msg+="Run:\n  sudo ./atlantisboard-setup\n\n"
    msg+="Or enter your password when sudo prompts in the terminal."
    atl_whiptail_display --title "Administrator access required" --msgbox \
      "$msg" 14 72 || true
    exit 1
  fi
}


atl_sudo_mkdir_p() {
  local dir="$1"
  dir="$(atl_sanitize_input "$dir")"
  dir="${dir%/}"
  if [[ -z "$dir" ]]; then
    local msg
    msg="A directory path is required but was empty.\n\n"
    msg+="This usually means the installer did not receive a valid path "
    msg+="from the prompts."
    atl_whiptail_msgbox --title "Invalid path" --msgbox \
      "$msg" 12 72 || true
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
    local msg
    msg="The ${label} is missing or invalid.\n\n"
    msg+="Use an absolute path such as /opt/atlantisboard "
    msg+="(not empty or /)."
    atl_whiptail_msgbox --title "Invalid path" --msgbox \
      "$msg" 12 72
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


## atl_env_get
# Read a value from ENV_VALUES with fallback default.
# Arguments:
#   $1 key, $2 default.
atl_env_get() {
  local key="$1" default="$2" value
  value="${ENV_VALUES[$key]:-}"
  if [[ -z "$value" ]]; then
    value="$default"
  fi
  printf '%s' "$value"
}


# Read a single KEY=value from the install .env on disk
# (authoritative after atl_write_env_file).

## atl_env_get_from_file
# Read a single KEY=value from a stored .env file.
# Arguments:
#   $1 key, $2 env file path.
atl_env_get_from_file() {
  local key="$1" env_file="$2"
  local line value
  [[ -n "$key" && -n "$env_file" ]] || return 1
  atl_sudo test -f "$env_file" 2>/dev/null || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    [[ "${BASH_REMATCH[1]}" == "$key" ]] || continue
    value="${BASH_REMATCH[2]}"
    value="${value%$'\r'}"
    if [[ "$value" =~ ^\"(.*)\"$ ]]; then
      value="${BASH_REMATCH[1]}"
    elif [[ "$value" =~ ^\'(.*)\'$ ]]; then
      value="${BASH_REMATCH[1]}"
    fi
    [[ -n "$value" ]] || return 1
    printf '%s' "$value"
    return 0
  done < <(atl_sudo cat "$env_file" 2>/dev/null || true)
  return 1
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
    url)
      echo "Enter a full URL starting with http:// or https:// (no spaces)."
      ;;
    cors)
      echo "Enter one or more URLs separated by commas (http:// or https://)."
      ;;
    boolean) echo "Enter exactly true or false." ;;
    path_absolute)
      echo "Enter one absolute path starting with / "
      echo "(no URLs or other settings pasted in)."
      ;;
    host) echo "Enter a hostname (letters, numbers, dots, hyphens)." ;;
    domain) echo "Enter a public domain name (e.g. boards.example.com)." ;;
    mongodb_uri)
      echo "Enter a MongoDB URI starting with mongodb:// or mongodb+srv://."
      ;;
    install_dir)
      echo "Enter an absolute install path (e.g. /opt/atlantisboard)."
      ;;
    google_client_id)
      echo "Paste your Google OAuth Client ID (*.apps.googleusercontent.com)."
      ;;
    proxy_hops)
      echo "Enter a number from 0 to 10 (use 1 behind Nginx or Caddy)."
      ;;
    max_body_mb | positive_int)
      echo "Enter a whole number from 1 to 10240 (megabytes)."
      ;;
    email) echo "Enter a valid email address." ;;
    *) echo "That value is not valid. Please try again." ;;
  esac
}


atl_field_applies_to_mode() {
  local field_json="$1" mode="$2"
  local applies hide_for
  applies="$(
    jq -r '.applies_to // empty
      | if length == 0 then "all" else join(" ") end' <<<"$field_json"
  )"
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
  applies="$(
    jq -r '.applies_to // empty
      | if length == 0 then "all" else join(" ") end' <<<"$section_json"
  )"
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
    [[ "$(jq -r '.auto_generate // false' <<<"$field")" == "true" ]] \
      && count=$((count + 1))
  done < <(jq -c '.sections[].fields[]' "$ENV_FIELDS")
  printf '%s' "$count"
}


atl_generate_install_secrets() {
  local mode="$1" count
  [[ -f "$ENV_FIELDS" ]] && command -v jq >/dev/null 2>&1 || return 0
  count="$(atl_count_auto_generate_fields "$mode")"
  local msg
  msg="Generating all keys and passwords...\n\n"
  msg+="Creating ${count} secure random values.\n\n"
  msg+="Secrets are never shown on screen."
  atl_whiptail_display --title "Security" --infobox \
    "$msg" 10 72
  atl_auto_generate_secrets "$mode"
}


## atl_prompt_validated
# Prompt until a field value passes validation.
# Arguments:
#   key label desc default secret optional validation_type.
atl_prompt_validated() {
  local key="$1" label="$2" desc="$3" default="$4"
  local secret="$5" optional="$6" vtype="$7"
  local current prompt_text err_msg valid=false

  while [[ "$valid" != true ]]; do
    current="${ENV_VALUES[$key]:-$default}"
    prompt_text="${label}\n\n${desc}"
    if [[ "$optional" == "true" ]]; then
      prompt_text="${prompt_text}\n\n(Optional — leave blank to skip.)"
    fi

    if [[ "$secret" == "true" ]]; then
      # Never pre-fill password boxes
      # (avoids flashing generated or existing secrets).
      current="$(
        atl_whiptail_capture --passwordbox "$prompt_text" 14 78 ""
      )" || return 1
    else
      current="$(
        atl_whiptail_capture --inputbox "$prompt_text" 14 78 "$current"
      )" || return 1
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
      atl_whiptail_display --title "Invalid input" --msgbox \
        "${label}\n\n${err_msg}" 12 70 || true
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
  if [[ -n "${ENV_VALUES[JWT_SECRET]:-}" \
    && -n "${ENV_VALUES[MEDIA_SIGN_SECRET]:-}" ]]; then
    if [[ "${ENV_VALUES[MEDIA_SIGN_SECRET]}" \
      == "${ENV_VALUES[JWT_SECRET]}" ]]; then
      ENV_VALUES["MEDIA_SIGN_SECRET"]="$(atl_generate_secret)"
    fi
  fi
}


## atl_prompt_env_fields
# Prompt user for all enabled fields for install mode.
# Arguments:
#   $1 install mode.
atl_prompt_env_fields() {
  local mode="$1"
  [[ -f "$ENV_FIELDS" ]] && command -v jq >/dev/null 2>&1 || {
    local msg
    msg="jq not found; only auto-generated secrets "
    msg+="and defaults will be used.\n\n"
    msg+="Install jq for the full setup experience."
    atl_whiptail_display --title "Setup" --msgbox \
      "$msg" 10 70 || true
    return 0
  }

  local section title intro field key label desc default
  local secret optional vtype auto_gen
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
      atl_prompt_validated "$key" "$label" "$desc" "$default" \
        "$secret" "$optional" "$vtype" || exit 1
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
      ENV_VALUES["POMPELMI_CLAMD_HOST"]="${
        ENV_VALUES[POMPELMI_CLAMD_HOST]:-127.0.0.1
      }"
      ENV_VALUES["POMPELMI_CLAMD_PORT"]="${
        ENV_VALUES[POMPELMI_CLAMD_PORT]:-3310
      }"
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
    oauth_origin="$(
      atl_url_origin "${ENV_VALUES[GOOGLE_OAUTH_BROWSER_ORIGIN]:-}"
    )" || oauth_origin=""
    if [[ -z "$oauth_origin" ]]; then
      local msg
      msg="Google OAuth browser origin is required when a Client ID is set.\n\n"
      msg+="Enter the origin users open in the browser "
      msg+="(e.g. https://boards.example.com)."
      atl_whiptail_msgbox --title "Google sign-in" --msgbox \
        "$msg" 12 72 || true
      atl_prompt_validated "GOOGLE_OAUTH_BROWSER_ORIGIN" \
        "Google OAuth browser origin" \
        "Must match an authorized redirect origin in Google Cloud Console." \
        "${app_origin:-https://boards.example.com}" \
        "false" "false" "url" || exit 1
      continue
    fi
    ENV_VALUES["GOOGLE_OAUTH_BROWSER_ORIGIN"]="$oauth_origin"
    if [[ -n "$app_origin" && "$oauth_origin" != "$app_origin" ]]; then
      local mismatch_msg
      mismatch_msg="Google OAuth browser origin must match your public site "
      mismatch_msg+="URL origin.\n\n"
      mismatch_msg+="APP_URL origin: ${app_origin}\n"
      mismatch_msg+="OAuth origin: ${oauth_origin}\n\n"
      mismatch_msg+="Update one of them so they match."
      atl_whiptail_msgbox --title "Google sign-in" --msgbox \
        "$mismatch_msg" 14 72 || true
      atl_prompt_validated "GOOGLE_OAUTH_BROWSER_ORIGIN" \
        "Google OAuth browser origin" \
        "Use the same scheme and host as APP_URL \
(path is stripped automatically)." \
        "$app_origin" "false" "false" "url" || exit 1
      continue
    fi
    break
  done
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


atl_apply_mode_defaults() {
  local mode="$1"
  case "$mode" in
    docker)
      ENV_VALUES["REDIS_HOST"]="localhost"
      ENV_VALUES["MINIO_ENDPOINT"]="localhost"
      ENV_VALUES["MONGODB_ROOT_USER"]="${
        ENV_VALUES[MONGODB_ROOT_USER]:-kanboard_root
      }"
      ENV_VALUES["MONGODB_APP_USER"]="${
        ENV_VALUES[MONGODB_APP_USER]:-kanboard_app
      }"
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
      ENV_VALUES["MONGODB_ROOT_USER"]="${
        ENV_VALUES[MONGODB_ROOT_USER]:-kanboard_root
      }"
      ENV_VALUES["MONGODB_APP_USER"]="${
        ENV_VALUES[MONGODB_APP_USER]:-kanboard_app
      }"
      ENV_VALUES["MONGODB_URI"]="$(atl_build_mongodb_uri \
        "${ENV_VALUES[MONGODB_APP_USER]}" \
        "${ENV_VALUES[MONGODB_APP_PASSWORD]}" \
        "mongodb" \
        "${ENV_VALUES[MONGODB_DB_NAME]:-kanboard}")"
      ENV_VALUES["MINIO_ROOT_ACCESS_KEY"]="${
        ENV_VALUES[MINIO_ROOT_ACCESS_KEY]:-${ENV_VALUES[MINIO_ACCESS_KEY]}
      }"
      ENV_VALUES["MINIO_ROOT_SECRET_KEY"]="${
        ENV_VALUES[MINIO_ROOT_SECRET_KEY]:-${ENV_VALUES[MINIO_SECRET_KEY]}
      }"
      ;;
  esac
  atl_apply_pompelmi_defaults "$mode"
  ENV_VALUES["NODE_ENV"]="${ENV_VALUES[NODE_ENV]:-production}"
}


## atl_write_env_file
# Merge ENV_VALUES into an existing .env file on disk.
# Arguments:
#   $1 env file path.
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


## atl_prompt_install_dir
# Prompt for and validate installation directory.
# Arguments:
#   $1 default path.
atl_prompt_install_dir() {
  local default="$1"
  local valid=false current err_msg
  while [[ "$valid" != true ]]; do
    current="$(atl_whiptail_capture --title "Install location" --inputbox \
      "Where should Atlantisboard be installed?\n\nUse an absolute path. \
Default: ${default}" \
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
      atl_whiptail_msgbox --title "Invalid path" --msgbox \
        "${err_msg}\n\nYou entered: ${current:-(empty)}" 12 70 || true
    fi
  done
}

