#!/usr/bin/env bash
# Reverse proxy setup (Nginx / Caddy) for atlantisboard-setup — sourced, not executed directly.
set -euo pipefail

REVERSE_PROXY_FIELDS="${PKG_ROOT}/install/reverse-proxy-fields.json"
declare -A PROXY_VALUES

_proxy_sed_escape() {
  printf '%s' "$1" | sed -e 's/[&|]/\\&/g'
}

_prompt_proxy_field() {
  local key="$1" label="$2" desc="$3" default="$4" secret="$5" optional="${6:-false}" vtype="${7:-}"
  local current prompt_text err_msg valid=false

  while [[ "$valid" != true ]]; do
    current="${PROXY_VALUES[$key]:-$default}"
    prompt_text="${label}\n\n${desc}"
    if [[ "$optional" == "true" ]]; then
      prompt_text="${prompt_text}\n\n(Optional — leave blank to skip.)"
    fi
    if [[ "$secret" == "true" ]]; then
      current="$(atl_whiptail_capture --passwordbox "$prompt_text" 14 78 "")" || return 1
    else
      current="$(atl_whiptail_capture --inputbox "$prompt_text" 14 78 "$current")" || return 1
    fi
    current="$(atl_sanitize_input "$current")"
    if atl_validate_value "$current" "$vtype" "$optional"; then
      PROXY_VALUES["$key"]="$current"
      valid=true
    else
      err_msg="$(atl_validation_message "$vtype")"
      whiptail --title "Invalid input" --msgbox "${label}\n\n${err_msg}" 12 70 || true
    fi
  done
}

_prompt_proxy_fields_for() {
  local engine="$1"
  if [[ ! -f "$REVERSE_PROXY_FIELDS" ]] || ! command -v jq >/dev/null 2>&1; then
    whiptail --title "Reverse proxy" --msgbox "jq or reverse-proxy-fields.json missing; cannot prompt proxy settings." 8 60
    return 1
  fi

  PROXY_VALUES["PROXY_BACKEND_PORT"]="${ENV_VALUES[PORT]:-3000}"
  PROXY_VALUES["PROXY_BACKEND_HOST"]="127.0.0.1"

  while IFS= read -r section; do
    applies="$(jq -r '.applies_to | join(" ")' <<<"$section")"
    if [[ " $applies " != *" $engine "* ]]; then
      continue
    fi
    title="$(jq -r '.title' <<<"$section")"
    whiptail --title "$title" --msgbox "Configure ${title} in the next dialogs." 8 60 || true
    mapfile -t fields < <(jq -c '.fields[]' <<<"$section")
    for field in "${fields[@]}"; do
      key="$(jq -r '.key' <<<"$field")"
      label="$(jq -r '.label' <<<"$field")"
      desc="$(jq -r '.description' <<<"$field")"
      default="$(jq -r '.default' <<<"$field")"
      secret="$(jq -r '.secret // false' <<<"$field")"
      optional="$(jq -r '.optional // false' <<<"$field")"
      vtype="$(jq -r '.validation // empty' <<<"$field")"
      if [[ "$default" == *"DOMAIN_PLACEHOLDER"* ]]; then
        default="${default//DOMAIN_PLACEHOLDER/${PROXY_VALUES[PROXY_DOMAIN]:-boards.example.com}}"
      fi
      _prompt_proxy_field "$key" "$label" "$desc" "$default" "$secret" "$optional" "$vtype" || return 1
    done
  done < <(jq -c '.sections[]' "$REVERSE_PROXY_FIELDS")

  local domain="${PROXY_VALUES[PROXY_DOMAIN]// /}"
  if [[ -z "$domain" ]]; then
    whiptail --title "Reverse proxy" --msgbox "Domain name is required for reverse proxy setup." 8 60
    return 1
  fi
  PROXY_VALUES["PROXY_DOMAIN"]="$domain"
}

_sync_env_public_url() {
  local domain="${PROXY_VALUES[PROXY_DOMAIN]}"
  local public_url="https://${domain}"
  # Keep CORS aligned with the public site URL users open in the browser.
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
    whiptail --title "Package install" --msgbox \
      "Automatic package install requires apt-get, dnf, yum, or apk.\n\nInstall these packages yourself, then copy configs from ${INSTALL_DIR}/install/ (nginx/ or caddy/).\n\nSee DEPLOYMENT.md and docs/wiki/reverse-proxy.md.\n\nPackages: ${pkgs[*]}" \
      16 78
    return 1
  fi
  atl_whiptail_display --title "Installing packages" --infobox "Installing: ${pkgs[*]} ..." 8 70
  atl_pkg_install_packages "$pm" "${pkgs[@]}"
}

_render_nginx_site() {
  local tpl="$1"
  local dest="$2"
  local domain="${PROXY_VALUES[PROXY_DOMAIN]}"
  local max_body="${PROXY_VALUES[PROXY_MAX_BODY_MB]}m"
  local ssl_cert="${PROXY_VALUES[NGINX_SSL_CERT]//DOMAIN_PLACEHOLDER/$domain}"
  local ssl_key="${PROXY_VALUES[NGINX_SSL_KEY]//DOMAIN_PLACEHOLDER/$domain}"

  sudo sed \
    -e "s|@DOMAIN@|$(_proxy_sed_escape "$domain")|g" \
    -e "s|@BACKEND_HOST@|$(_proxy_sed_escape "${PROXY_VALUES[PROXY_BACKEND_HOST]}")|g" \
    -e "s|@BACKEND_PORT@|$(_proxy_sed_escape "${PROXY_VALUES[PROXY_BACKEND_PORT]}")|g" \
    -e "s|@MAX_BODY@|$(_proxy_sed_escape "$max_body")|g" \
    -e "s|@SSL_CERT@|$(_proxy_sed_escape "$ssl_cert")|g" \
    -e "s|@SSL_KEY@|$(_proxy_sed_escape "$ssl_key")|g" \
    -e "s|@SSL_OPTIONS@|$(_proxy_sed_escape "${PROXY_VALUES[NGINX_SSL_OPTIONS]}")|g" \
    -e "s|@SSL_DHPARAM@|$(_proxy_sed_escape "${PROXY_VALUES[NGINX_SSL_DHPARAM]}")|g" \
    "$tpl" | sudo tee "$dest" >/dev/null
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
    _render_nginx_site "${PKG_ROOT}/install/nginx/atlantisboard-http.conf.template" "$site_available"
    whiptail --title "Nginx TLS" --msgbox "TLS certificate files were not found.\n\nInstalled HTTP-only config first.\nUse certbot next to enable HTTPS." 10 70
  else
    _render_nginx_site "${PKG_ROOT}/install/nginx/atlantisboard.conf.template" "$site_available"
  fi

  sudo ln -sf "$site_available" /etc/nginx/sites-enabled/atlantisboard
  if [[ -f /etc/nginx/sites-enabled/default ]]; then
    sudo rm -f /etc/nginx/sites-enabled/default
  fi

  if ! sudo nginx -t 2>/tmp/nginx-test.err; then
    whiptail --title "Nginx config error" --msgbox "$(cat /tmp/nginx-test.err)" 16 70
    return 1
  fi
  sudo systemctl enable nginx
  sudo systemctl reload nginx

  if [[ "$use_https_tpl" == false ]]; then
    if ! whiptail --title "Let's Encrypt" --yesno "Run certbot --nginx for ${domain} now?\n\nRequires port 80 reachable from the internet." 12 70; then
      return 0
    fi
    if ! command -v certbot >/dev/null 2>&1; then
      if whiptail --title "certbot" --yesno "Install certbot and python3-certbot-nginx?" 10 70; then
        _install_proxy_packages certbot python3-certbot-nginx || return 0
      else
        return 0
      fi
    fi
    if command -v certbot >/dev/null 2>&1; then
      local -a certbot_args=(certbot --nginx -d "$domain" --non-interactive --agree-tos --redirect)
      if [[ -n "${PROXY_VALUES[PROXY_ACME_EMAIL]:-}" ]]; then
        certbot_args+=(--email "${PROXY_VALUES[PROXY_ACME_EMAIL]}")
      else
        certbot_args+=(--register-unsafely-without-email)
      fi
      if sudo "${certbot_args[@]}"; then
        PROXY_VALUES[NGINX_SSL_CERT]="/etc/letsencrypt/live/${domain}/fullchain.pem"
        PROXY_VALUES[NGINX_SSL_KEY]="/etc/letsencrypt/live/${domain}/privkey.pem"
        _render_nginx_site "${PKG_ROOT}/install/nginx/atlantisboard.conf.template" "$site_available"
        sudo nginx -t && sudo systemctl reload nginx
      else
        whiptail --title "certbot" --msgbox "certbot failed. Fix DNS/firewall, then run:\n  sudo certbot --nginx -d ${domain}" 12 70
      fi
    fi
  fi
}

_configure_caddy() {
  local tpl="${PKG_ROOT}/install/caddy/atlantisboard.caddy.template"
  local conf_d="/etc/caddy/conf.d"
  local site_file="${conf_d}/atlantisboard.caddy"
  local domain="${PROXY_VALUES[PROXY_DOMAIN]}"
  local max_body="${PROXY_VALUES[PROXY_MAX_BODY_MB]}MB"

  if ! _install_proxy_packages caddy; then
    return 1
  fi

  sudo mkdir -p "$conf_d" /var/log/caddy
  sudo chown -R caddy:caddy /var/log/caddy 2>/dev/null || sudo chown -R root:root /var/log/caddy

  if [[ -n "${PROXY_VALUES[PROXY_ACME_EMAIL]:-}" ]]; then
    printf '%s\n' "{" "    email ${PROXY_VALUES[PROXY_ACME_EMAIL]}" "}" | sudo tee "${conf_d}/00-acme-email.caddy" >/dev/null
  fi

  sudo sed \
    -e "s|@DOMAIN@|$(_proxy_sed_escape "$domain")|g" \
    -e "s|@BACKEND_HOST@|$(_proxy_sed_escape "${PROXY_VALUES[PROXY_BACKEND_HOST]}")|g" \
    -e "s|@BACKEND_PORT@|$(_proxy_sed_escape "${PROXY_VALUES[PROXY_BACKEND_PORT]}")|g" \
    -e "s|@MAX_BODY@|$(_proxy_sed_escape "$max_body")|g" \
    -e "s|@LOG_FILE@|$(_proxy_sed_escape "${PROXY_VALUES[CADDY_LOG_FILE]}")|g" \
    "$tpl" | sudo tee "$site_file" >/dev/null

  local main_file="/etc/caddy/Caddyfile"
  if [[ -f "$main_file" ]] && ! grep -q 'conf.d/\*\.caddy' "$main_file" 2>/dev/null; then
    if ! grep -q 'atlantisboard.caddy' "$main_file" 2>/dev/null; then
      echo "" | sudo tee -a "$main_file" >/dev/null
      echo "import ${conf_d}/*.caddy" | sudo tee -a "$main_file" >/dev/null
    fi
  elif [[ ! -f "$main_file" ]]; then
    echo "import ${conf_d}/*.caddy" | sudo tee "$main_file" >/dev/null
  fi

  if command -v caddy >/dev/null 2>&1; then
    sudo caddy validate --config "$main_file" || {
      whiptail --title "Caddy config error" --msgbox "caddy validate failed for ${main_file}" 8 60
      return 1
    }
  fi
  sudo systemctl enable caddy
  sudo systemctl reload caddy
}

run_reverse_proxy_wizard() {
  if ! whiptail --title "Reverse proxy" --yesno "Install and configure a reverse proxy (Nginx or Caddy) for HTTPS and WebSockets?" 10 70; then
    return 0
  fi

  local choice
  choice="$(atl_whiptail_capture --title "Reverse proxy" --menu "Choose web server" 14 70 3 \
    "nginx" "Nginx — manual TLS paths or certbot" \
    "caddy" "Caddy — automatic HTTPS (Let's Encrypt)" \
    "skip" "Skip reverse proxy setup")" || return 0

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
      ;;
    caddy)
      _configure_caddy || return 1
      ;;
  esac

  local summary="Reverse proxy (${choice}) configured for:\nhttps://${PROXY_VALUES[PROXY_DOMAIN]}\n\nBackend: ${PROXY_VALUES[PROXY_BACKEND_HOST]}:${PROXY_VALUES[PROXY_BACKEND_PORT]}\n\nAPP_URL and CORS_ORIGIN updated in .env"
  whiptail --title "Reverse proxy" --msgbox "$summary" 14 70
}
