#!/usr/bin/env bash
# Shared Whiptail helpers: Atlantisboard theme, validation, secret generation.
# Sourced by setup.sh and reverse-proxy.sh (expects PKG_ROOT, ENV_VALUES, ENV_FIELDS).
set -euo pipefail

atl_apply_theme() {
  # Atlantis Leadership palette: blue background, white body text, cyan accent on focus.
  # label= is required for whiptail --msgbox body text (without it, distro defaults = unreadable).
  unset NEWT_COLORS_FILE
  export NEWT_COLORS='
root=,blue
window=,blue
border=white,blue
shadow=,black
title=white,blue
roottext=white,blue
label=white,blue
textbox=white,blue
acttextbox=white,blue
helpline=white,blue
button=white,blue
actbutton=black,cyan
compactbutton=white,blue
actcompactbutton=black,cyan
entry=white,blue
actentry=black,cyan
disentry=,blue
listbox=white,blue
actlistbox=black,cyan
sellslistbox=white,blue
actsellistbox=black,cyan
checkbox=white,blue
actcheckbox=black,cyan
'
}

atl_generate_secret() {
  openssl rand -base64 48 | tr -d '\n'
}

atl_generate_minio_key() {
  # MinIO access keys: alphanumeric, 16 chars.
  openssl rand -hex 8
}

atl_require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    whiptail --title "Missing prerequisite" --msgbox "Required command not found: $1\n\nInstall it and run atlantisboard-setup again." 12 60
    exit 1
  fi
}

atl_sanitize_input() {
  local val="$1"
  val="${val//$'\r'/}"
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
      [[ "$val" == "true" || "$val" == "false" ]]
      ;;
    path_absolute)
      [[ "$val" == /* ]] && [[ "$val" != "/" ]]
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
      [[ "$val" == /* ]] && [[ "$val" != "/" ]]
      ;;
    google_client_id)
      [[ "$val" =~ \.apps\.googleusercontent\.com$ ]]
      ;;
    proxy_hops)
      [[ "$val" =~ ^[0-9]+$ ]] && (( val >= 0 && val <= 10 ))
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
    path_absolute) echo "Enter an absolute path starting with / (not just /)." ;;
    host) echo "Enter a hostname (letters, numbers, dots, hyphens)." ;;
    domain) echo "Enter a public domain name (e.g. boards.example.com)." ;;
    mongodb_uri) echo "Enter a MongoDB URI starting with mongodb:// or mongodb+srv://." ;;
    install_dir) echo "Enter an absolute install path (e.g. /opt/atlantisboard)." ;;
    google_client_id) echo "Paste your Google OAuth Client ID (*.apps.googleusercontent.com)." ;;
    proxy_hops) echo "Enter a number from 0 to 10 (use 1 behind Nginx or Caddy)." ;;
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
      current="$(whiptail --passwordbox "$prompt_text" 14 78 "$current" 3>&2 1>&2)" || return 1
    else
      current="$(whiptail --inputbox "$prompt_text" 14 78 "$current" 3>&2 1>&2)" || return 1
    fi
    current="$(atl_sanitize_input "$current")"

    if atl_validate_value "$current" "$vtype" "$optional"; then
      ENV_VALUES["$key"]="$current"
      valid=true
    else
      err_msg="$(atl_validation_message "$vtype")"
      whiptail --title "Invalid input" --msgbox "${label}\n\n${err_msg}" 12 70 || true
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
    whiptail --title "Setup" --msgbox "jq not found; only auto-generated secrets and defaults will be used.\n\nInstall jq for the full setup experience." 10 70 || true
    return 0
  }

  local section title intro field key label desc default secret optional vtype auto_gen
  while IFS= read -r section; do
    atl_section_applies_to_mode "$section" "$mode" || continue
    title="$(jq -r '.title' <<<"$section")"
    intro="$(jq -r '.intro // empty' <<<"$section")"
    if [[ -n "$intro" ]]; then
      whiptail --title "$title" --msgbox "$intro" 12 70 || true
    else
      whiptail --title "$title" --msgbox "Configure ${title} in the next dialogs." 8 70 || true
    fi

    mapfile -t fields < <(jq -c '.fields[]' <<<"$section")
    for field in "${fields[@]}"; do
      atl_field_applies_to_mode "$field" "$mode" || continue
      key="$(jq -r '.key' <<<"$field")"
      auto_gen="$(jq -r '.auto_generate // false' <<<"$field")"
      if [[ "$auto_gen" == "true" ]]; then
        continue
      fi
      label="$(jq -r '.label' <<<"$field")"
      desc="$(jq -r '.description' <<<"$field")"
      default="$(jq -r '.default' <<<"$field")"
      secret="$(jq -r '.secret // false' <<<"$field")"
      optional="$(jq -r '.optional // false' <<<"$field")"
      vtype="$(jq -r '.validation // empty' <<<"$field")"
      atl_prompt_validated "$key" "$label" "$desc" "$default" "$secret" "$optional" "$vtype" || exit 1
    done
  done < <(jq -c '.sections[]' "$ENV_FIELDS")
}

atl_apply_mode_defaults() {
  local mode="$1"
  case "$mode" in
    docker)
      ENV_VALUES["REDIS_HOST"]="localhost"
      ENV_VALUES["MINIO_ENDPOINT"]="localhost"
      ENV_VALUES["MONGODB_URI"]="mongodb://localhost:27017/kanboard?replicaSet=rs0"
      ;;
    fullstack)
      ENV_VALUES["REDIS_HOST"]="redis"
      ENV_VALUES["MINIO_ENDPOINT"]="minio"
      ENV_VALUES["HOST"]="0.0.0.0"
      ENV_VALUES["ENABLE_CRON_JOBS_IN_MAIN"]="true"
      ENV_VALUES["MONGODB_ROOT_USER"]="${ENV_VALUES[MONGODB_ROOT_USER]:-kanboard_root}"
      ENV_VALUES["MONGODB_APP_USER"]="${ENV_VALUES[MONGODB_APP_USER]:-kanboard_app}"
      ENV_VALUES["MONGODB_URI"]="mongodb://${ENV_VALUES[MONGODB_APP_USER]}:${ENV_VALUES[MONGODB_APP_PASSWORD]}@mongodb:27017/kanboard?authSource=kanboard&replicaSet=rs0"
      ENV_VALUES["MINIO_ROOT_ACCESS_KEY"]="${ENV_VALUES[MINIO_ROOT_ACCESS_KEY]:-${ENV_VALUES[MINIO_ACCESS_KEY]}}"
      ENV_VALUES["MINIO_ROOT_SECRET_KEY"]="${ENV_VALUES[MINIO_ROOT_SECRET_KEY]:-${ENV_VALUES[MINIO_SECRET_KEY]}}"
      ;;
  esac
  ENV_VALUES["NODE_ENV"]="${ENV_VALUES[NODE_ENV]:-production}"
}

atl_write_env_file() {
  local env_file="$1"
  local key val
  for key in "${!ENV_VALUES[@]}"; do
    val="${ENV_VALUES[$key]}"
    if grep -q "^${key}=" "$env_file" 2>/dev/null; then
      sudo sed -i "s|^${key}=.*|${key}=${val}|" "$env_file"
    else
      echo "${key}=${val}" | sudo tee -a "$env_file" >/dev/null
    fi
  done
  sudo chmod 600 "$env_file"
}

atl_docker_compose() {
  local compose_dir="$1" compose_file="$2"
  shift 2
  if docker compose version >/dev/null 2>&1; then
    (cd "$compose_dir" && docker compose --env-file "$ENV_FILE" -f "$compose_file" "$@")
  else
    (cd "$compose_dir" && docker-compose --env-file "$ENV_FILE" -f "$compose_file" "$@")
  fi
}

atl_prompt_install_dir() {
  local default="$1"
  local valid=false current err_msg
  while [[ "$valid" != true ]]; do
    current="$(whiptail --title "Install location" --inputbox \
      "Where should Atlantisboard be installed?\n\nUse an absolute path. Default: ${default}" \
      12 78 "$default" 3>&2 1>&2)" || exit 1
    current="$(atl_sanitize_input "$current")"
    current="${current%/}"
    if [[ -z "$current" ]]; then
      current="$default"
    fi
    if atl_validate_value "$current" "install_dir" "false"; then
      INSTALL_DIR="$current"
      valid=true
    else
      err_msg="$(atl_validation_message install_dir)"
      whiptail --title "Invalid path" --msgbox "${err_msg}\n\nYou entered: ${current:-(empty)}" 12 70 || true
    fi
  done
}
