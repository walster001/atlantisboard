#!/usr/bin/env bash
# Headless upgrade/repair helpers for CI-driven remote deploys.


## atl_is_noninteractive
# True when ATL_NONINTERACTIVE=1 (set by atlantisboard-setup --non-interactive).
atl_is_noninteractive() {
  [[ "${ATL_NONINTERACTIVE:-0}" == "1" ]]
}


## atl_assert_required_env_fields
# Fail when required (non-optional, non-auto) env fields are empty.
# Arguments:
#   $1 install mode.
atl_assert_required_env_fields() {
  local mode="$1"
  if ! atl_env_fields_jq_ready; then
    return 0
  fi

  local section field key optional auto_gen missing=()
  while IFS= read -r section; do
    atl_section_applies_to_mode "$section" "$mode" || continue
    mapfile -t fields < <(jq -c '.fields[]' <<<"$section")
    for field in "${fields[@]}"; do
      atl_field_applies_to_mode "$field" "$mode" || continue
      auto_gen="$(jq -r '.auto_generate // false' <<<"$field")"
      [[ "$auto_gen" != "true" ]] || continue
      optional="$(jq -r '.optional // false' <<<"$field")"
      [[ "$optional" != "true" ]] || continue
      key="$(jq -r '.key' <<<"$field")"
      if [[ -z "${ENV_VALUES[$key]:-}" ]]; then
        missing+=("$key")
      fi
    done
  done < <(jq -c '.sections[]' "$ENV_FIELDS")

  if [[ "${#missing[@]}" -gt 0 ]]; then
    err "Non-interactive upgrade requires these .env values: ${missing[*]}"
    return 1
  fi
  return 0
}


## atl_init_noninteractive_upgrade
# Validate env and derive MODE / INSTALL_ACTION for headless repair or update.
# Arguments:
#   $1 install directory.
# Outputs:
#   Sets global MODE and INSTALL_ACTION; validates existing install.
atl_init_noninteractive_upgrade() {
  local install_dir="$1"
  install_dir="$(atl_sanitize_input "$install_dir")"
  install_dir="${install_dir%/}"

  INSTALL_ACTION="${INSTALL_ACTION:-update}"
  case "$INSTALL_ACTION" in
    update | repair) ;;
    *)
      err "Non-interactive mode requires INSTALL_ACTION=update or repair (got: ${INSTALL_ACTION})"
      return 1
      ;;
  esac

  INSTALL_DIR="$install_dir"
  export ATLANTISBOARD_INSTALL_DIR="$INSTALL_DIR"

  local existing_state
  existing_state="$(atl_detect_existing_install "$INSTALL_DIR")"
  if [[ "$existing_state" == "none" ]]; then
    err "No existing installation at ${INSTALL_DIR}; use interactive setup for fresh installs"
    return 1
  fi

  MODE="$(atl_saved_install_mode "$INSTALL_DIR")"
  case "$MODE" in
    fullstack | docker | manual) ;;
    *)
      err "Could not read ATLANTISBOARD_INSTALL_MODE from ${INSTALL_DIR}/.env"
      return 1
      ;;
  esac

  info "Non-interactive ${INSTALL_ACTION} for ${MODE} install at ${INSTALL_DIR}"
  return 0
}
