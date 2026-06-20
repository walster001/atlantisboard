#!/usr/bin/env bash
# Uses env bash for PATH portability (project convention).
# Reverse proxy setup for atlantisboard-setup (sourced, not executed directly).
set -euo pipefail

REVERSE_PROXY_FIELDS="${PKG_ROOT}/install/reverse-proxy-fields.json"
declare -A PROXY_VALUES

_proxy_sed_escape() {
  printf '%s' "$1" | sed -e 's/[&|]/\\&/g'
}

# Browser-facing MinIO CDN path (must match MINIO_CDN_PATH_PREFIX in .env).
_proxy_resolve_cdn_path() {
  local raw="${ENV_VALUES[MINIO_CDN_PATH_PREFIX]:-/cdn}"
  raw="${raw// /}"
  if [[ "$raw" != /* ]]; then
    raw="/${raw}"
  fi
  raw="${raw%/}"
  if [[ -z "$raw" ]]; then
    raw="/cdn"
  fi
  printf '%s' "$raw"
}

# Loopback upstream for host-installed Caddy/Nginx (MinIO published on 127.0.0.1:9000 in fullstack Compose).
_proxy_resolve_minio_upstream_host() {
  local endpoint="${ENV_VALUES[MINIO_ENDPOINT]:-127.0.0.1}"
  endpoint="${endpoint// /}"
  case "$endpoint" in
    minio|kanboard-minio|localhost|127.0.0.1)
      printf '%s' '127.0.0.1'
      ;;
    *)
      printf '%s' "$endpoint"
      ;;
  esac
}

_proxy_resolve_minio_upstream_port() {
  local port="${ENV_VALUES[MINIO_PORT]:-9000}"
  port="${port// /}"
  if [[ -z "$port" ]]; then
    port='9000'
  fi
  printf '%s' "$port"
}

# Host header MinIO expects for SigV4 presigned URLs minted by the app (MINIO_ENDPOINT:MINIO_PORT).
_proxy_resolve_minio_presign_host() {
  local endpoint="${ENV_VALUES[MINIO_ENDPOINT]:-localhost}"
  endpoint="${endpoint// /}"
  local port
  port="$(_proxy_resolve_minio_upstream_port)"
  printf '%s:%s' "$endpoint" "$port"
}

_proxy_enable_cdn_edge_termination_env() {
  if [[ -n "${ENV_VALUES[MINIO_CDN_PATH_PREFIX]:-}" ]] \
    || [[ -n "${ENV_VALUES[S3_PUBLIC_URL]:-}" ]] \
    || [[ -n "${ENV_VALUES[ATTACHMENT_PUBLIC_BASE]:-}" ]]; then
    ENV_VALUES['MINIO_CDN_EDGE_TERMINATION']='true'
    atl_write_env_file "$ENV_FILE"
  fi
}

_prompt_proxy_field() {
  local key="$1"
  local label="$2"
  local desc="$3"
  local default="$4"
  local secret="$5"
  local optional="${6:-false}"
  local vtype="${7:-}"
  local current prompt_text err_msg valid=false

  while [[ "$valid" != true ]]; do
    current="${PROXY_VALUES[$key]:-$default}"
    prompt_text="${label}\n\n${desc}"
    if [[ "$optional" == "true" ]]; then
      prompt_text="${prompt_text}\n\n(Optional - leave blank to skip.)"
    fi
    if [[ "$secret" == "true" ]]; then
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
      PROXY_VALUES["$key"]="$current"
      valid=true
    else
      err_msg="$(atl_validation_message "$vtype")"
      atl_whiptail_msgbox --title "Invalid input" --msgbox \
        "${label}\n\n${err_msg}" 12 70 || true
    fi
  done
}

_prompt_proxy_fields_for() {
  local engine="$1"
  if [[ ! -f "$REVERSE_PROXY_FIELDS" ]] || ! command -v jq >/dev/null 2>&1; then
    atl_whiptail_msgbox --title "Reverse proxy" --msgbox \
      "jq or reverse-proxy-fields.json missing; cannot prompt proxy settings." \
      8 60
    return 1
  fi

  PROXY_VALUES["PROXY_BACKEND_PORT"]="${ENV_VALUES[PORT]:-3000}"
  PROXY_VALUES["PROXY_BACKEND_HOST"]="127.0.0.1"

  local section_intro_shown=false
  while IFS= read -r section; do
    applies="$(jq -r '.applies_to | join(" ")' <<<"$section")"
    if [[ " $applies " != *" $engine "* ]]; then
      continue
    fi

    local intro key label desc default secret optional vtype
    intro="$(jq -r '.intro // empty' <<<"$section")"
    mapfile -t fields < <(jq -c '.fields[]' <<<"$section")
    for field in "${fields[@]}"; do
      key="$(jq -r '.key' <<<"$field")"
      label="$(jq -r '.label' <<<"$field")"
      desc="$(jq -r '.description' <<<"$field")"
      if [[ "$section_intro_shown" != true && -n "$intro" ]]; then
        desc="${intro}\n\n${desc}"
        section_intro_shown=true
      fi
      default="$(jq -r '.default' <<<"$field")"
      secret="$(jq -r '.secret // false' <<<"$field")"
      optional="$(jq -r '.optional // false' <<<"$field")"
      vtype="$(jq -r '.validation // empty' <<<"$field")"
      if [[ "$default" == *"DOMAIN_PLACEHOLDER"* ]]; then
        default="${default//DOMAIN_PLACEHOLDER/\
${PROXY_VALUES[PROXY_DOMAIN]:-boards.example.com}}"
      fi
      _prompt_proxy_field \
        "$key" "$label" "$desc" "$default" "$secret" "$optional" "$vtype" \
        || return 1
    done
  done < <(jq -c '.sections[]' "$REVERSE_PROXY_FIELDS")

  local domain="${PROXY_VALUES[PROXY_DOMAIN]// /}"
  if [[ -z "$domain" ]]; then
    atl_whiptail_msgbox --title "Reverse proxy" --msgbox \
      "Domain name is required for reverse proxy setup." 8 60
    return 1
  fi
  PROXY_VALUES["PROXY_DOMAIN"]="$domain"
}

_sync_env_public_url() {
  local domain="${PROXY_VALUES[PROXY_DOMAIN]}"
  local public_url="https://${domain}"
  ENV_VALUES["APP_URL"]="$public_url"
  ENV_VALUES["CORS_ORIGIN"]="$public_url"
  ENV_VALUES["TRUST_PROXY_HOPS"]="1"
  atl_write_env_file "$ENV_FILE"
}

_install_proxy_packages() {
  local pkgs=("$@")
  local pm
  pm="$(atl_detect_pkg_manager)" || pm=""
  if [[ -z "$pm" ]]; then
    local package_msg
    package_msg="$(cat <<EOF
Automatic package install requires apt-get, dnf, yum, or apk.

Install these packages yourself, then copy configs from:
${INSTALL_DIR}/install/ (nginx/ or caddy/).

See DEPLOYMENT.md and docs/wiki/reverse-proxy.md.

Packages: ${pkgs[*]}
EOF
)"
    atl_whiptail_msgbox --title "Package install" --msgbox \
      "$package_msg" 16 78
    return 1
  fi
  atl_whiptail_infobox --title "Installing packages" --infobox \
    "Installing: ${pkgs[*]} ..." 8 70
  atl_pkg_install_packages "$pm" "${pkgs[@]}"
}

_render_nginx_site() {
  local tpl="$1"
  local dest="$2"
  local domain="${PROXY_VALUES[PROXY_DOMAIN]}"
  local max_body="${PROXY_VALUES[PROXY_MAX_BODY_MB]}m"
  local ssl_cert="${PROXY_VALUES[NGINX_SSL_CERT]//DOMAIN_PLACEHOLDER/$domain}"
  local ssl_key="${PROXY_VALUES[NGINX_SSL_KEY]//DOMAIN_PLACEHOLDER/$domain}"
  local backend_host="${PROXY_VALUES[PROXY_BACKEND_HOST]}"
  local backend_port="${PROXY_VALUES[PROXY_BACKEND_PORT]}"
  local ssl_options="${PROXY_VALUES[NGINX_SSL_OPTIONS]}"
  local ssl_dhparam="${PROXY_VALUES[NGINX_SSL_DHPARAM]}"
  local cdn_path
  cdn_path="$(_proxy_resolve_cdn_path)"
  local minio_upstream_host
  minio_upstream_host="$(_proxy_resolve_minio_upstream_host)"
  local minio_upstream_port
  minio_upstream_port="$(_proxy_resolve_minio_upstream_port)"
  local minio_presign_host
  minio_presign_host="$(_proxy_resolve_minio_presign_host)"

  atl_sudo sed \
    -e "s|@DOMAIN@|$(_proxy_sed_escape "$domain")|g" \
    -e "s|@BACKEND_HOST@|$(_proxy_sed_escape "$backend_host")|g" \
    -e "s|@BACKEND_PORT@|$(_proxy_sed_escape "$backend_port")|g" \
    -e "s|@MAX_BODY@|$(_proxy_sed_escape "$max_body")|g" \
    -e "s|@SSL_CERT@|$(_proxy_sed_escape "$ssl_cert")|g" \
    -e "s|@SSL_KEY@|$(_proxy_sed_escape "$ssl_key")|g" \
    -e "s|@SSL_OPTIONS@|$(_proxy_sed_escape "$ssl_options")|g" \
    -e "s|@SSL_DHPARAM@|$(_proxy_sed_escape "$ssl_dhparam")|g" \
    -e "s|@CDN_PATH@|$(_proxy_sed_escape "$cdn_path")|g" \
    -e "s|@MINIO_UPSTREAM_HOST@|$(_proxy_sed_escape "$minio_upstream_host")|g" \
    -e "s|@MINIO_UPSTREAM_PORT@|$(_proxy_sed_escape "$minio_upstream_port")|g" \
    -e "s|@MINIO_PRESIGN_HOST@|$(_proxy_sed_escape "$minio_presign_host")|g" \
    "$tpl" | atl_sudo tee "$dest" >/dev/null
}

_configure_nginx() {
  local site_available="/etc/nginx/sites-available/atlantisboard"
  local domain="${PROXY_VALUES[PROXY_DOMAIN]}"
  local ssl_cert="${PROXY_VALUES[NGINX_SSL_CERT]//DOMAIN_PLACEHOLDER/$domain}"
  local ssl_key="${PROXY_VALUES[NGINX_SSL_KEY]//DOMAIN_PLACEHOLDER/$domain}"
  local use_https_tpl=true

  if ! _install_proxy_packages nginx; then
    return 1
  fi

  if [[ ! -f "$ssl_cert" ]] || [[ ! -f "$ssl_key" ]]; then
    use_https_tpl=false
    _render_nginx_site \
      "${PKG_ROOT}/install/nginx/atlantisboard-http.conf.template" \
      "$site_available"
    local nginx_tls_msg
    nginx_tls_msg="$(cat <<'EOF'
TLS certificate files were not found.

Installed HTTP-only config first.
Use certbot next to enable HTTPS.
EOF
)"
    atl_whiptail_msgbox --title "Nginx TLS" --msgbox "$nginx_tls_msg" 10 70
  else
    _render_nginx_site \
      "${PKG_ROOT}/install/nginx/atlantisboard.conf.template" \
      "$site_available"
  fi

  atl_sudo ln -sf "$site_available" /etc/nginx/sites-enabled/atlantisboard
  if atl_sudo test -f /etc/nginx/sites-enabled/default 2>/dev/null; then
    atl_sudo rm -f /etc/nginx/sites-enabled/default
  fi

  if ! atl_sudo nginx -t 2>/tmp/nginx-test.err; then
    atl_whiptail_msgbox --title "Nginx config error" --msgbox \
      "$(cat /tmp/nginx-test.err)" 16 70
    return 1
  fi
  atl_sudo systemctl enable nginx
  atl_sudo systemctl reload nginx
  _proxy_enable_cdn_edge_termination_env

  if [[ "$use_https_tpl" == false ]]; then
    local letsencrypt_msg
    letsencrypt_msg="$(cat <<EOF
Run certbot --nginx for ${domain} now?

Requires port 80 reachable from the internet.
EOF
)"
    if ! atl_whiptail_yesno --title "Let's Encrypt" --yesno \
      "$letsencrypt_msg" 12 70; then
      return 0
    fi
    if ! command -v certbot >/dev/null 2>&1; then
      if atl_whiptail_yesno --title "certbot" --yesno \
        "Install certbot and python3-certbot-nginx?" 10 70; then
        _install_proxy_packages certbot python3-certbot-nginx || return 0
      else
        return 0
      fi
    fi
    if command -v certbot >/dev/null 2>&1; then
      local -a certbot_args=(
        certbot
        --nginx
        -d "$domain"
        --non-interactive
        --agree-tos
        --redirect
      )
      if [[ -n "${PROXY_VALUES[PROXY_ACME_EMAIL]:-}" ]]; then
        certbot_args+=(--email "${PROXY_VALUES[PROXY_ACME_EMAIL]}")
      else
        certbot_args+=(--register-unsafely-without-email)
      fi
      if atl_sudo "${certbot_args[@]}"; then
        PROXY_VALUES[NGINX_SSL_CERT]="/etc/letsencrypt/live/${domain}/\
fullchain.pem"
        PROXY_VALUES[NGINX_SSL_KEY]="/etc/letsencrypt/live/${domain}/\
privkey.pem"
        _render_nginx_site \
          "${PKG_ROOT}/install/nginx/atlantisboard.conf.template" \
          "$site_available"
        atl_sudo nginx -t && atl_sudo systemctl reload nginx
      else
        local certbot_fail_msg
        certbot_fail_msg="$(cat <<EOF
certbot failed. Fix DNS/firewall, then run:
  sudo certbot --nginx -d ${domain}
EOF
)"
        atl_whiptail_msgbox --title "certbot" --msgbox \
          "$certbot_fail_msg" 12 70
      fi
    fi
  fi
}

# Distro Caddyfile must import conf.d only (global { } blocks must be first).
_atl_write_caddy_mainfile() {
  local main_file="/etc/caddy/Caddyfile"
  local conf_d="/etc/caddy/conf.d"
  local backup="${main_file}.pre-atlantisboard"
  local marker='# atlantisboard-setup'

  if atl_sudo test -f "$main_file" && ! atl_sudo test -f "$backup"; then
    atl_sudo cp -a "$main_file" "$backup"
  fi
  atl_sudo tee "$main_file" >/dev/null <<EOF
${marker} — imports conf.d (package default backed up to ${backup}).
import ${conf_d}/*.caddy
EOF
}

_install_caddy_logrotate() {
  local log_file="$1"
  local tpl="${PKG_ROOT}/install/caddy/atlantisboard-logrotate.conf"
  local dest="/etc/logrotate.d/atlantisboard-caddy"
  [[ -f "$tpl" ]] || return 0
  atl_sudo sed \
    -e "s|@LOG_FILE@|$(_proxy_sed_escape "$log_file")|g" \
    "$tpl" | atl_sudo tee "$dest" >/dev/null
  atl_sudo chmod 0644 "$dest"
}

# Update/repair path: install logrotate when Caddy site already exists (no wizard).
atl_ensure_caddy_logrotate() {
  local site_file="/etc/caddy/conf.d/atlantisboard.caddy"
  local log_file="/var/log/caddy/atlantisboard.log"
  local parsed
  atl_sudo test -f "$site_file" 2>/dev/null || return 0
  parsed="$(
    atl_sudo grep -E 'output[[:space:]]+file[[:space:]]+' "$site_file" 2>/dev/null \
      | head -1 \
      | sed -E 's/.*output[[:space:]]+file[[:space:]]+([^[:space:]]+).*/\1/' \
      || true
  )"
  if [[ -n "$parsed" ]]; then
    log_file="$parsed"
  fi
  _install_caddy_logrotate "$log_file"
}

_configure_caddy() {
  local tpl="${PKG_ROOT}/install/caddy/atlantisboard.caddy.template"
  local conf_d="/etc/caddy/conf.d"
  local site_file="${conf_d}/atlantisboard.caddy"
  local domain="${PROXY_VALUES[PROXY_DOMAIN]}"
  local max_body="${PROXY_VALUES[PROXY_MAX_BODY_MB]}MB"
  local backend_host="${PROXY_VALUES[PROXY_BACKEND_HOST]}"
  local backend_port="${PROXY_VALUES[PROXY_BACKEND_PORT]}"
  local log_file="${PROXY_VALUES[CADDY_LOG_FILE]}"
  local cdn_path
  cdn_path="$(_proxy_resolve_cdn_path)"
  local minio_upstream_host
  minio_upstream_host="$(_proxy_resolve_minio_upstream_host)"
  local minio_upstream_port
  minio_upstream_port="$(_proxy_resolve_minio_upstream_port)"
  local minio_presign_host
  minio_presign_host="$(_proxy_resolve_minio_presign_host)"

  if ! _install_proxy_packages caddy; then
    return 1
  fi

  atl_sudo mkdir -p "$conf_d" /var/log/caddy
  atl_sudo chown -R caddy:caddy /var/log/caddy 2>/dev/null \
    || atl_sudo chown -R root:root /var/log/caddy

  _install_caddy_logrotate "$log_file"

  if [[ -n "${PROXY_VALUES[PROXY_ACME_EMAIL]:-}" ]]; then
    printf '%s\n' \
      "{" \
      "    email ${PROXY_VALUES[PROXY_ACME_EMAIL]}" \
      "}" \
      | atl_sudo tee "${conf_d}/00-acme-email.caddy" >/dev/null
  fi

  atl_sudo sed \
    -e "s|@DOMAIN@|$(_proxy_sed_escape "$domain")|g" \
    -e "s|@BACKEND_HOST@|$(_proxy_sed_escape "$backend_host")|g" \
    -e "s|@BACKEND_PORT@|$(_proxy_sed_escape "$backend_port")|g" \
    -e "s|@MAX_BODY@|$(_proxy_sed_escape "$max_body")|g" \
    -e "s|@LOG_FILE@|$(_proxy_sed_escape "$log_file")|g" \
    -e "s|@CDN_PATH@|$(_proxy_sed_escape "$cdn_path")|g" \
    -e "s|@MINIO_UPSTREAM_HOST@|$(_proxy_sed_escape "$minio_upstream_host")|g" \
    -e "s|@MINIO_UPSTREAM_PORT@|$(_proxy_sed_escape "$minio_upstream_port")|g" \
    -e "s|@MINIO_PRESIGN_HOST@|$(_proxy_sed_escape "$minio_presign_host")|g" \
    "$tpl" | atl_sudo tee "$site_file" >/dev/null

  _proxy_enable_cdn_edge_termination_env

  _atl_write_caddy_mainfile

  local main_file="/etc/caddy/Caddyfile"
  if command -v caddy >/dev/null 2>&1; then
    local err_file
    err_file="$(mktemp)"
    if ! atl_sudo caddy validate --config "$main_file" 2>"$err_file"; then
      local err_msg
      err_msg="$(tr -d '\r' <"$err_file" | tail -n 8 || true)"
      rm -f "$err_file"
      atl_whiptail_msgbox --title "Caddy config error" --msgbox \
        "caddy validate failed for ${main_file}:\n\n${err_msg}" 14 72
      return 1
    fi
    rm -f "$err_file"
  fi
  atl_sudo systemctl enable caddy
  atl_sudo systemctl reload caddy
}

# Run the reverse proxy selection and configuration wizard.
run_reverse_proxy_wizard() {
  local app_url="${ENV_VALUES[APP_URL]:-http://localhost:3000}"
  local domain=""
  local proxy_prompt

  if atl_app_url_is_local "$app_url"; then
    proxy_prompt="$(cat <<EOF
Your public site URL is local (${app_url}).

Set up Caddy or Nginx now for HTTPS on a real domain?

Choose No to open the app locally without a proxy.
EOF
)"
  else
    domain="$(atl_extract_domain_from_url "$app_url" 2>/dev/null || true)"
    proxy_prompt="$(cat <<EOF
Finish HTTPS setup so users can sign in at:
${app_url}

Install Caddy (recommended) or Nginx on this server.

Use Tab to move, Enter to select Yes or No.
EOF
)"
  fi

  if ! atl_whiptail_yesno --title "HTTPS / reverse proxy" --yesno \
    "$proxy_prompt" 14 78; then
    return 0
  fi

  local choice
  if [[ -n "$domain" ]]; then
    PROXY_VALUES["PROXY_DOMAIN"]="$domain"
  fi
  choice="$(atl_whiptail_capture --title "Reverse proxy" --menu \
    "Choose web server (arrow keys + Enter):" 14 72 3 \
    "caddy" "Caddy - automatic HTTPS (recommended)" \
    "nginx" "Nginx - your certificates or certbot" \
    "skip" "Skip - configure proxy myself")" || return 0

  if [[ "$choice" == "skip" ]]; then
    return 0
  fi

  if ! _prompt_proxy_fields_for "$choice"; then
    return 1
  fi

  _sync_env_public_url

  case "$choice" in
    nginx)
      _configure_nginx || return 1
      # Read by setup.sh for install manifest (sourced scope).
      # shellcheck disable=SC2034
      ATL_REVERSE_PROXY_KIND=nginx
      ;;
    caddy)
      _configure_caddy || return 1
      # shellcheck disable=SC2034
      ATL_REVERSE_PROXY_KIND=caddy
      ;;
  esac

  local ready_msg
  ready_msg="$(cat <<EOF
HTTPS is configured.

Open: https://${PROXY_VALUES[PROXY_DOMAIN]}

Backend: ${PROXY_VALUES[PROXY_BACKEND_HOST]}:\
${PROXY_VALUES[PROXY_BACKEND_PORT]}
EOF
)"
  atl_whiptail_msgbox --title "Reverse proxy ready" --msgbox \
    "$ready_msg" 12 72 || true
}
