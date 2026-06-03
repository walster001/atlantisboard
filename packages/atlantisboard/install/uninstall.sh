#!/usr/bin/env bash
# Interactive Atlantisboard uninstaller (Linux + whiptail). Removes fullstack, docker, and manual installs.
set -euo pipefail

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
  echo "atlantisboard-uninstall: could not locate package root (set ATLANTISBOARD_PACKAGE_ROOT)" >&2
  exit 1
}

PKG_ROOT="$(_resolve_pkg_root)"
export ATLANTISBOARD_PACKAGE_ROOT="$PKG_ROOT"

# shellcheck source=lib/common.sh
source "${PKG_ROOT}/install/lib/common.sh"
# shellcheck source=lib/uninstall-lib.sh
source "${PKG_ROOT}/install/lib/uninstall-lib.sh"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "atlantisboard-uninstall requires Linux." >&2
  exit 1
fi

if ! command -v whiptail >/dev/null 2>&1; then
  if ! atl_bootstrap_whiptail; then
    echo "atlantisboard-uninstall requires whiptail. Install whiptail and retry." >&2
    exit 1
  fi
fi

atl_apply_theme
atl_require_sudo_access

if ! atl_uninstall_discover_state "$PKG_ROOT"; then
  atl_whiptail_display --title "Nothing found" --msgbox \
    "No Atlantisboard installation was detected.\n\nLooked for:\n• ${ATL_MANIFEST_NAME} under /opt/atlantisboard\n• systemd units atlantisboard.service\n• Docker containers named atlantisboard-*\n\nIf you installed elsewhere, set ATLANTISBOARD_INSTALL_DIR and re-run." \
    14 72 || true
  exit 1
fi

atl_whiptail_display --title "Uninstall Atlantisboard" --msgbox \
  "This wizard removes Atlantisboard from this server.\n\nDetected mode: ${ATL_UNINSTALL_MODE}\nInstall directory: ${ATL_UNINSTALL_INSTALL_DIR:-unknown}\n\nPress OK to continue." \
  12 72 || exit 0

mode_choice=""
detected="${ATL_UNINSTALL_MODE}"
if ! mode_choice="$(atl_whiptail_capture --title "Installation type" --menu \
  "Confirm the installation type to remove (or change if detection was wrong):" 16 78 4 \
  "auto" "Use detected: ${detected}" \
  "fullstack" "Docker full stack (app + MongoDB + Redis + MinIO)" \
  "docker" "Docker dependencies only (host app via systemd)" \
  "manual" "Host app only (external MongoDB, Redis, MinIO)")"; then
  exit 0
fi
mode_choice="$(atl_sanitize_input "$mode_choice")"
case "$mode_choice" in
  auto) ATL_UNINSTALL_MODE="$detected" ;;
  fullstack | docker | manual) ATL_UNINSTALL_MODE="$mode_choice" ;;
  *)
    atl_whiptail_display --title "Installation type" --msgbox "Invalid selection. Uninstall cancelled." 8 60 || true
    exit 1
    ;;
esac

summary="The following will be removed or stopped:\n\n"
summary+="• Mode: ${ATL_UNINSTALL_MODE}\n"
summary+="• Install tree: ${ATL_UNINSTALL_INSTALL_DIR}\n"
[[ -n "${ATL_UNINSTALL_BACKUP_DIR:-}" ]] && summary+="• Backups: ${ATL_UNINSTALL_BACKUP_DIR}\n"
[[ "$ATL_UNINSTALL_SYSTEMD_MAIN" == true ]] && summary+="• systemd: atlantisboard.service\n"
[[ "$ATL_UNINSTALL_SYSTEMD_WORKER" == true ]] && summary+="• systemd: atlantisboard-worker.service\n"
case "$ATL_UNINSTALL_MODE" in
  fullstack | docker)
    summary+="• Docker containers and volumes (MongoDB, Redis, MinIO, ClamAV"
    [[ "$ATL_UNINSTALL_MODE" == fullstack ]] && summary+=", app image"
    summary+=")\n"
    ;;
esac
case "$ATL_UNINSTALL_REVERSE_PROXY" in
  nginx) summary+="• Nginx site: atlantisboard\n" ;;
  caddy) summary+="• Caddy site: atlantisboard.caddy\n" ;;
esac
[[ "$ATL_UNINSTALL_CREATED_USER" == true ]] && summary+="• System user: atlantisboard\n"
summary+="\nBun (/usr/local/bin/bun) and Let's Encrypt certificates are not removed.\n"
summary+="\nThis cannot be undone. Continue?"

if ! atl_whiptail_display --title "Confirm uninstall" --yesno "$summary" 18 78; then
  exit 0
fi

if ! atl_ensure_sudo_credentials; then
  atl_whiptail_display --title "Administrator access" --msgbox \
    "Could not obtain sudo privileges.\n\nRun: sudo ./atlantisboard-uninstall" \
    10 72 || true
  exit 1
fi

atl_whiptail_display --title "Uninstalling" --infobox \
  "Stopping services and removing files...\n\nPlease wait." \
  10 70 || true

atl_uninstall_log "mode=${ATL_UNINSTALL_MODE} install_dir=${ATL_UNINSTALL_INSTALL_DIR}"

if [[ "$ATL_UNINSTALL_SYSTEMD_MAIN" == true || "$ATL_UNINSTALL_SYSTEMD_WORKER" == true ]]; then
  atl_uninstall_stop_systemd
fi

case "$ATL_UNINSTALL_MODE" in
  fullstack | docker)
    atl_uninstall_remove_docker "$ATL_UNINSTALL_MODE" "${ATL_UNINSTALL_INSTALL_DIR}" "${ATL_UNINSTALL_ENV_FILE:-}"
    ;;
esac

atl_uninstall_remove_systemd_units
atl_uninstall_remove_reverse_proxy "$ATL_UNINSTALL_REVERSE_PROXY"

path=""
while IFS= read -r path; do
  [[ -n "$path" ]] || continue
  case "$path" in
    */install/uninstall.sh | */install/lib/uninstall-lib.sh | */atlantisboard-uninstall | */${ATL_MANIFEST_NAME})
      continue
      ;;
  esac
  atl_uninstall_remove_path "$path"
done < <(atl_uninstall_collect_tracked_paths \
  "${ATL_UNINSTALL_INSTALL_DIR}" \
  "${ATL_UNINSTALL_BACKUP_DIR:-}" \
  "${ATL_UNINSTALL_MODE}" \
  "${ATL_UNINSTALL_REVERSE_PROXY}")

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
  vmsg+="\nReview manually (docker ps -a, systemctl status, ls /opt/atlantisboard)."
  atl_whiptail_display --title "Uninstall incomplete" --msgbox "$vmsg" 16 72 || true
  exit 1
fi

atl_uninstall_remove_self_scripts "$PKG_ROOT"

if [[ -e "${PKG_ROOT}/atlantisboard-uninstall" ]] || [[ -e "${PKG_ROOT}/install/uninstall.sh" ]]; then
  atl_whiptail_display --title "Cleanup" --msgbox \
    "Core application files were removed, but this uninstall script could not delete itself.\n\nRemove manually:\n  rm -f ${PKG_ROOT}/atlantisboard-uninstall ${PKG_ROOT}/install/uninstall.sh" \
    12 72 || true
  exit 1
fi

atl_whiptail_display --title "Uninstall complete" --msgbox \
  "Atlantisboard has been removed from this server.\n\nThis uninstall script has been deleted from the package directory." \
  10 72 || true
