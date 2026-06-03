#!/usr/bin/env bash
# Uses env bash for PATH portability (project convention).
# Interactive Atlantisboard uninstaller (Linux + whiptail).
set -euo pipefail

# Resolve package root from env override or script location.
_resolve_pkg_root() {
  if [[ -n "${ATLANTISBOARD_PACKAGE_ROOT:-}" ]]; then
    cd "${ATLANTISBOARD_PACKAGE_ROOT}" && pwd
    return 0
  fi
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "${script_dir}/../package.json" ]]; then
    cd "${script_dir}/.." && pwd
    return 0
  fi
  if [[ -f "${script_dir}/../../package.json" ]]; then
    cd "${script_dir}/../.." && pwd
    return 0
  fi
  printf '%s\n' \
    "atlantisboard-uninstall: could not locate package root " \
    "(set ATLANTISBOARD_PACKAGE_ROOT)" >&2
  exit 1
}

# Run the interactive uninstall flow.
main() {
  local pkg_root
  pkg_root="$(_resolve_pkg_root)"
  readonly PKG_ROOT="$pkg_root"
  export ATLANTISBOARD_PACKAGE_ROOT="$PKG_ROOT"

  # shellcheck source=lib/common.sh
  source "${PKG_ROOT}/install/lib/common.sh"
  # shellcheck source=lib/uninstall-lib.sh
  source "${PKG_ROOT}/install/lib/uninstall-lib.sh"

  if ! declare -F info >/dev/null 2>&1; then
    info() {
      printf '%s\n' "$*" >&2
    }
  fi
  if ! declare -F err >/dev/null 2>&1; then
    err() {
      printf '%s\n' "$*" >&2
    }
  fi

  if [[ "$(uname -s)" != "Linux" ]]; then
    err "atlantisboard-uninstall requires Linux."
    exit 1
  fi

  if ! command -v whiptail >/dev/null 2>&1; then
    if ! atl_bootstrap_whiptail; then
      err "atlantisboard-uninstall requires whiptail."
      err "Install whiptail and retry."
      exit 1
    fi
  fi

  atl_apply_theme
  atl_require_sudo_access

  if ! atl_uninstall_discover_state "$PKG_ROOT"; then
    local not_found_msg
    not_found_msg="$(cat <<EOF
No Atlantisboard installation was detected.

Looked for:
- ${ATL_MANIFEST_NAME} under /opt/atlantisboard
- systemd units atlantisboard.service
- Docker containers named atlantisboard-*

If you installed elsewhere, set ATLANTISBOARD_INSTALL_DIR
and re-run.
EOF
)"
    atl_whiptail_display --title "Nothing found" --msgbox \
      "$not_found_msg" 14 72 || true
    exit 1
  fi

  local intro_msg
  intro_msg="$(cat <<EOF
This wizard removes Atlantisboard from this server.

Detected mode: ${ATL_UNINSTALL_MODE}
Install directory: ${ATL_UNINSTALL_INSTALL_DIR:-unknown}

Press OK to continue.
EOF
)"
  atl_whiptail_display --title "Uninstall Atlantisboard" --msgbox \
    "$intro_msg" 12 72 || exit 0

  mode_choice=""
  detected="${ATL_UNINSTALL_MODE}"
  local mode_prompt
  mode_prompt="Confirm installation type to remove "
  mode_prompt+="(or change if detection was wrong):"
  if ! mode_choice="$(
    atl_whiptail_capture --title "Installation type" --menu \
      "$mode_prompt" \
      16 78 4 \
      "auto" "Use detected: ${detected}" \
      "fullstack" "Docker full stack (app + MongoDB + Redis + MinIO)" \
      "docker" "Docker dependencies only (host app via systemd)" \
      "manual" "Host app only (external MongoDB, Redis, MinIO)"
  )"; then
    exit 0
  fi
  mode_choice="$(atl_sanitize_input "$mode_choice")"
  case "$mode_choice" in
    auto) ATL_UNINSTALL_MODE="$detected" ;;
    fullstack | docker | manual) ATL_UNINSTALL_MODE="$mode_choice" ;;
    *)
      atl_whiptail_display --title "Installation type" --msgbox \
        "Invalid selection. Uninstall cancelled." 8 60 || true
      exit 1
      ;;
  esac

  summary="The following will be removed or stopped:\n\n"
  summary+="• Mode: ${ATL_UNINSTALL_MODE}\n"
  summary+="• Install tree: ${ATL_UNINSTALL_INSTALL_DIR}\n"
  if [[ -n "${ATL_UNINSTALL_BACKUP_DIR:-}" ]]; then
    summary+="• Backups: ${ATL_UNINSTALL_BACKUP_DIR}\n"
  fi
  if [[ "$ATL_UNINSTALL_SYSTEMD_MAIN" == true ]]; then
    summary+="• systemd: atlantisboard.service\n"
  fi
  if [[ "$ATL_UNINSTALL_SYSTEMD_WORKER" == true ]]; then
    summary+="• systemd: atlantisboard-worker.service\n"
  fi
  case "$ATL_UNINSTALL_MODE" in
    fullstack | docker)
      summary+="• Docker containers and volumes (MongoDB, Redis, MinIO, ClamAV"
      if [[ "$ATL_UNINSTALL_MODE" == fullstack ]]; then
        summary+=", app image"
      fi
      summary+=")\n"
      ;;
  esac
  case "$ATL_UNINSTALL_REVERSE_PROXY" in
    nginx) summary+="• Nginx site: atlantisboard\n" ;;
    caddy) summary+="• Caddy site: atlantisboard.caddy\n" ;;
  esac
  if [[ "$ATL_UNINSTALL_CREATED_USER" == true ]]; then
    summary+="• System user: atlantisboard\n"
  fi
  summary+="\nBun (/usr/local/bin/bun) and Let's Encrypt certificates "
  summary+="are not removed.\n"
  summary+="\nThis cannot be undone. Continue?"

  if ! atl_whiptail_display --title "Confirm uninstall" --yesno \
    "$summary" 18 78; then
    exit 0
  fi

  if ! atl_ensure_sudo_credentials; then
    local sudo_msg
    sudo_msg="$(cat <<'EOF'
Could not obtain sudo privileges.

Run: sudo ./atlantisboard-uninstall
EOF
)"
    atl_whiptail_display --title "Administrator access" --msgbox \
      "$sudo_msg" 10 72 || true
    exit 1
  fi

  atl_whiptail_display --title "Uninstalling" --infobox \
    "Stopping services and removing files...\n\nPlease wait." \
    10 70 || true

  atl_uninstall_log \
    "mode=${ATL_UNINSTALL_MODE} install_dir=${ATL_UNINSTALL_INSTALL_DIR}"

  if [[ "$ATL_UNINSTALL_SYSTEMD_MAIN" == true \
    || "$ATL_UNINSTALL_SYSTEMD_WORKER" == true ]]; then
    atl_uninstall_stop_systemd
  fi

  case "$ATL_UNINSTALL_MODE" in
    fullstack | docker)
      atl_uninstall_remove_docker \
        "$ATL_UNINSTALL_MODE" \
        "${ATL_UNINSTALL_INSTALL_DIR}" \
        "${ATL_UNINSTALL_ENV_FILE:-}"
      ;;
  esac

  atl_uninstall_remove_systemd_units
  atl_uninstall_remove_reverse_proxy "$ATL_UNINSTALL_REVERSE_PROXY"

  path=""
  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    case "$path" in
      */install/uninstall.sh | */install/lib/uninstall-lib.sh \
      | */atlantisboard-uninstall | */"${ATL_MANIFEST_NAME}")
        continue
        ;;
    esac
    atl_uninstall_remove_path "$path"
  done < <(
    atl_uninstall_collect_tracked_paths \
      "${ATL_UNINSTALL_INSTALL_DIR}" \
      "${ATL_UNINSTALL_BACKUP_DIR:-}" \
      "${ATL_UNINSTALL_MODE}" \
      "${ATL_UNINSTALL_REVERSE_PROXY}"
  )

  if [[ "$ATL_UNINSTALL_CREATED_USER" == true ]]; then
    atl_uninstall_remove_system_user
  fi

  verify_fail=()
  if ! mapfile -t verify_fail < <(atl_uninstall_verify_remaining); then
    :
  fi

  if ((${#verify_fail[@]} > 0)); then
    vmsg="Some items could not be verified as removed:\n\n"
    for v in "${verify_fail[@]}"; do
      vmsg+="- ${v}\n"
    done
    vmsg+="\nReview manually (docker ps -a, systemctl status, "
    vmsg+="ls /opt/atlantisboard)."
    atl_whiptail_display --title "Uninstall incomplete" --msgbox \
      "$vmsg" 16 72 || true
    exit 1
  fi

  atl_uninstall_remove_self_scripts "$PKG_ROOT"

  if [[ -e "${PKG_ROOT}/atlantisboard-uninstall" ]] \
    || [[ -e "${PKG_ROOT}/install/uninstall.sh" ]]; then
    local cleanup_msg
    cleanup_msg="$(cat <<EOF
Core application files were removed, but this uninstall script
could not delete itself.

Remove manually:
  rm -f ${PKG_ROOT}/atlantisboard-uninstall \
${PKG_ROOT}/install/uninstall.sh
EOF
)"
    atl_whiptail_display --title "Cleanup" --msgbox \
      "$cleanup_msg" 12 72 || true
    exit 1
  fi

  local complete_msg
  complete_msg="$(cat <<'EOF'
Atlantisboard has been removed from this server.

This uninstall script has been deleted from the package directory.
EOF
)"
  atl_whiptail_display --title "Uninstall complete" --msgbox \
    "$complete_msg" 10 72 || true
}

main "$@"
