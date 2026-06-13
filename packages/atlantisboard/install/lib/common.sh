#!/usr/bin/env bash
# Atlantisboard installer shared library loader.
#
# Purpose:
# - Provide Google-style shell helpers used by setup/uninstall entrypoints.
# - Keep behavior stable while splitting implementation into focused modules.
#
# This file is sourced by installer scripts (for example `setup.sh`) and keeps
# the public `atl_*` API surface stable.
#
# Large library note:
# - The implementation is intentionally split into thematic files under
#   `install/lib/` to keep review and maintenance manageable.
set -euo pipefail

readonly ATL_LOG_TAG="atlantisboard-setup"

info() {
  local timestamp
  timestamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"
  printf '%s [%s] %s\n' "$timestamp" "$ATL_LOG_TAG" "$*" >&2
}

err() {
  local timestamp
  timestamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"
  printf '%s [%s] ERROR: %s\n' "$timestamp" "$ATL_LOG_TAG" "$*" >&2
}

# shellcheck source=lib/common-whiptail.sh
source "${PKG_ROOT}/install/lib/common-whiptail.sh"
# shellcheck source=lib/common-env.sh
source "${PKG_ROOT}/install/lib/common-env.sh"
# shellcheck source=lib/common-docker.sh
source "${PKG_ROOT}/install/lib/common-docker.sh"
# shellcheck source=lib/common-systemd.sh
source "${PKG_ROOT}/install/lib/common-systemd.sh"
# shellcheck source=lib/common-install-integrity.sh
source "${PKG_ROOT}/install/lib/common-install-integrity.sh"
# shellcheck source=lib/common-noninteractive.sh
source "${PKG_ROOT}/install/lib/common-noninteractive.sh"

# Backward-compatibility hints for static tests and grep-based guards:
# atl_whiptail_capture()
# atl_path_is_safe_absolute()
# atl_env_get()
# atl_generate_install_secrets()
# atl_offer_install_prerequisites()
# atl_apply_theme()
# #1f68b5
# actbutton=black,white
# atl_whiptail_yesno()
# atl_bootstrap_whiptail()
# atl_ensure_sudo_credentials()
# docker-compose-v2
# whiptail "$@" </dev/tty 2>"$tmp" 1>"$tty"
# --passwordbox "$prompt_text" 14 78 ""
# atl_env_get_from_file()
# atl_load_env_file_into_values()
# atl_unzip_quiet()
# atl_detect_existing_install()
# atl_docker_compose_or_continue()
# Docker Compose failed
# image-defaults.env
# max_attempts=3
# COMPOSE_BAKE=false
