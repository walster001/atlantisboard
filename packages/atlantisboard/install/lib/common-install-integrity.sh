#!/usr/bin/env bash
# Existing-install detection, integrity verification, and non-destructive repair.


## atl_detect_existing_install
# Classify prior install state under install_dir.
# Arguments:
#   $1 install directory.
# Outputs:
#   none | partial | complete
# Returns:
#   0
atl_detect_existing_install() {
  local install_dir="$1"
  install_dir="$(atl_sanitize_input "$install_dir")"
  install_dir="${install_dir%/}"

  local -a complete_markers=(
    ".env"
    "dist/server/index.js"
    "install/setup.sh"
    "package.json"
  )
  local -a partial_markers=(
    ".env"
    "dist/server/index.js"
    "install/setup.sh"
    "package.json"
    "node_modules"
    "install/lib/common.sh"
    "atlantisboard"
    "atlantisboard-setup"
  )

  local found_complete=0 found_any=0 marker path
  for marker in "${complete_markers[@]}"; do
    path="${install_dir}/${marker}"
    if atl_sudo test -e "$path" 2>/dev/null; then
      found_any=1
      found_complete=$((found_complete + 1))
    fi
  done

  if [[ "$found_complete" -eq "${#complete_markers[@]}" ]]; then
    printf '%s' complete
    return 0
  fi

  for marker in "${partial_markers[@]}"; do
    path="${install_dir}/${marker}"
    if atl_sudo test -e "$path" 2>/dev/null; then
      found_any=1
      break
    fi
  done

  if [[ "$found_any" -eq 1 ]]; then
    printf '%s' partial
    return 0
  fi

  if atl_sudo test -d "$install_dir" 2>/dev/null; then
    if atl_sudo find "$install_dir" -mindepth 1 -maxdepth 1 \
      -print -quit 2>/dev/null | grep -q .; then
      printf '%s' partial
      return 0
    fi
  fi

  printf '%s' none
}


## atl_prompt_install_action
# Ask how to proceed when an existing install is detected.
# Arguments:
#   $1 existing state (partial | complete).
#   $2 install directory path.
# Outputs:
#   reinstall | repair
# Returns:
#   0 on choice, 1 on cancel.
atl_prompt_install_action() {
  local state="$1"
  local install_dir="$2"
  local intro msg choice
  case "$state" in
    complete)
      intro="An existing Atlantisboard installation was found at:"
      ;;
    partial)
      intro="An incomplete Atlantisboard installation was found at:"
      ;;
    *)
      intro="Existing files were found at:"
      ;;
  esac
  msg="${intro}\n${install_dir}\n\n"
  msg+="Choose how to continue:"

  choice="$(atl_whiptail_capture --title "Existing installation" --menu \
    "$msg" 18 78 3 \
    "repair" \
      "Keep and repair — verify files, fix missing only" \
    "reinstall" \
      "Reinstall — replace app files and reconfigure" \
    "cancel" \
      "Cancel setup")" || return 1

  choice="$(atl_sanitize_input "$choice")"
  case "$choice" in
    repair | reinstall)
      printf '%s' "$choice"
      return 0
      ;;
    cancel | "")
      return 1
      ;;
    *)
      err "unexpected install action: ${choice}"
      return 1
      ;;
  esac
}


## atl_backup_env_file
# Copy install .env to a timestamped backup beside the original.
# Arguments:
#   $1 env file path.
atl_backup_env_file() {
  local env_file="$1"
  local ts backup
  [[ -n "$env_file" ]] || return 0
  atl_sudo test -f "$env_file" 2>/dev/null || return 0
  ts="$(date '+%Y%m%d%H%M%S')"
  backup="${env_file}.bak.${ts}"
  atl_sudo cp -a "$env_file" "$backup"
  info "Backed up ${env_file} to ${backup}"
}


## atl_checksum_cmd
# Resolve a checksum command (sha256 preferred).
# Outputs:
#   Command name: sha256sum, shasum, or md5sum.
atl_checksum_cmd() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' sha256sum
  elif command -v shasum >/dev/null 2>&1; then
    printf '%s' shasum
  elif command -v md5sum >/dev/null 2>&1; then
    printf '%s' md5sum
  else
    return 1
  fi
}


## atl_file_checksum
# Compute checksum for a local file readable by the current user.
# Arguments:
#   $1 file path.
atl_file_checksum() {
  local file="$1"
  local cmd args=()
  cmd="$(atl_checksum_cmd)" || return 1
  case "$cmd" in
    shasum) args=(-a 256) ;;
  esac
  "$cmd" "${args[@]}" "$file" 2>/dev/null | awk '{print $1}'
}


## atl_sudo_file_checksum
# Compute checksum for a file that may require root to read.
# Arguments:
#   $1 file path.
atl_sudo_file_checksum() {
  local file="$1"
  local cmd args=() tmp
  cmd="$(atl_checksum_cmd)" || return 1
  tmp="$(mktemp)"
  case "$cmd" in
    shasum) args=(-a 256) ;;
  esac
  if ! atl_sudo cat "$file" >"$tmp" 2>/dev/null; then
    rm -f "$tmp"
    return 1
  fi
  "$cmd" "${args[@]}" "$tmp" 2>/dev/null | awk '{print $1}'
  rm -f "$tmp"
}


## atl_install_integrity_paths
# List relative paths checked during repair integrity verification.
atl_install_integrity_paths() {
  cat <<'EOF'
dist/server/index.js
dist/workers/index.js
public/index.js
install/setup.sh
install/lib/common.sh
install/lib/common-env.sh
install/lib/common-docker.sh
install/lib/common-systemd.sh
install/lib/common-whiptail.sh
install/lib/common-install-integrity.sh
install/env-fields.json
package.json
bun.lock
atlantisboard-setup
atlantisboard
install/docker/docker-compose.deps.yml
install/docker/docker-compose.fullstack.yml
install/docker/Dockerfile
install/docker/entrypoint.sh
install/docker/image-defaults.env
install/docker/reset-docker-data.sh
EOF
}


## atl_install_files_match
# Return success when source and destination files have the same checksum.
# Arguments:
#   $1 package root, $2 install dir, $3 relative path.
atl_install_files_match() {
  local pkg_root="$1" install_dir="$2" rel="$3"
  local src="${pkg_root}/${rel}" dest="${install_dir}/${rel}"
  local src_sum dest_sum

  atl_sudo test -f "$src" 2>/dev/null || return 1
  atl_sudo test -f "$dest" 2>/dev/null || return 1

  src_sum="$(atl_file_checksum "$src")" || return 1
  dest_sum="$(atl_sudo_file_checksum "$dest")" || return 1
  [[ -n "$src_sum" && "$src_sum" == "$dest_sum" ]]
}


## atl_verify_install_integrity
# Compare required package files against the install directory.
# Arguments:
#   $1 package root, $2 install dir.
# Outputs:
#   Three whitespace-separated integers: missing mismatched ok
atl_verify_install_integrity() {
  local pkg_root="$1" install_dir="$2"
  local rel missing=0 mismatched=0 ok=0
  while IFS= read -r rel || [[ -n "$rel" ]]; do
    [[ -n "$rel" ]] || continue
    if ! atl_sudo test -f "${install_dir}/${rel}" 2>/dev/null; then
      missing=$((missing + 1))
      continue
    fi
    if atl_install_files_match "$pkg_root" "$install_dir" "$rel"; then
      ok=$((ok + 1))
    else
      mismatched=$((mismatched + 1))
    fi
  done < <(atl_install_integrity_paths)
  printf '%s %s %s' "$missing" "$mismatched" "$ok"
}


## atl_repair_install_file
# Copy one relative path from package root into install dir.
# Arguments:
#   $1 package root, $2 install dir, $3 relative path.
atl_repair_install_file() {
  local pkg_root="$1" install_dir="$2" rel="$3"
  local src="${pkg_root}/${rel}" dest="${install_dir}/${rel}" parent
  atl_sudo test -f "$src" 2>/dev/null || return 1
  parent="$(dirname "$dest")"
  atl_sudo_mkdir_p "$parent" || return 1
  atl_sudo cp -a "$src" "$dest"
}


## atl_repair_install_files
# Repair missing or changed required files without deleting extras.
# Arguments:
#   $1 package root, $2 install dir.
# Outputs:
#   Number of files copied.
atl_repair_install_files() {
  local pkg_root="$1" install_dir="$2"
  local rel repaired=0
  local missing mismatched ok

  read -r missing mismatched ok \
    <<< "$(atl_verify_install_integrity "$pkg_root" "$install_dir")"

  while IFS= read -r rel || [[ -n "$rel" ]]; do
    [[ -n "$rel" ]] || continue
    if atl_install_files_match "$pkg_root" "$install_dir" "$rel"; then
      continue
    fi
    if atl_repair_install_file "$pkg_root" "$install_dir" "$rel"; then
      repaired=$((repaired + 1))
    fi
  done < <(atl_install_integrity_paths)

  # Sync docker helper trees (mongodb/, minio/, systemd templates) without --delete.
  if atl_sudo test -d "${pkg_root}/install/docker" 2>/dev/null; then
    atl_sudo rsync -a \
      "${pkg_root}/install/docker/" "${install_dir}/install/docker/"
  fi
  if atl_sudo test -d "${pkg_root}/install/systemd" 2>/dev/null; then
    atl_sudo rsync -a \
      "${pkg_root}/install/systemd/" "${install_dir}/install/systemd/"
  fi
  if atl_sudo test -d "${pkg_root}/install/lib" 2>/dev/null; then
    atl_sudo rsync -a \
      "${pkg_root}/install/lib/" "${install_dir}/install/lib/"
  fi
  if atl_sudo test -d "${pkg_root}/dist" 2>/dev/null; then
    atl_sudo rsync -a \
      "${pkg_root}/dist/" "${install_dir}/dist/"
  fi
  if atl_sudo test -d "${pkg_root}/public" 2>/dev/null; then
    atl_sudo rsync -a \
      "${pkg_root}/public/" "${install_dir}/public/"
  fi

  printf '%s' "$repaired"
}


## atl_needs_bun_install
# Return success when production dependencies should be installed.
# Arguments:
#   $1 install dir, $2 package root.
atl_needs_bun_install() {
  local install_dir="$1" pkg_root="$2"
  if ! atl_sudo test -d "${install_dir}/node_modules" 2>/dev/null; then
    return 0
  fi
  if ! atl_install_files_match "$pkg_root" "$install_dir" "package.json"; then
    return 0
  fi
  if ! atl_install_files_match "$pkg_root" "$install_dir" "bun.lock"; then
    return 0
  fi
  return 1
}


## atl_offer_docker_data_reset
# On reinstall, optionally run reset-docker-data.sh for docker modes.
# Arguments:
#   $1 install mode (docker | fullstack).
#   $2 install directory.
atl_offer_docker_data_reset() {
  local mode="$1"
  local install_dir="$2"
  local reset_mode script msg
  case "$mode" in
    docker) reset_mode=deps ;;
    fullstack) reset_mode=fullstack ;;
    *) return 0 ;;
  esac

  atl_docker_existing_stack_detected "$mode" || return 0

  msg="Existing Docker containers or volumes were found.\n\n"
  msg+="Reinstall generated new secrets in .env. Data volumes may still "
  msg+="hold old passwords unless you reset them.\n\n"
  msg+="Reset Docker data now (stops containers and deletes volumes)?"
  if ! atl_whiptail_yesno --title "Reset Docker data?" --yesno \
    "$msg" 16 78; then
    return 0
  fi

  script="${install_dir}/install/docker/reset-docker-data.sh"
  if ! atl_sudo test -x "$script" 2>/dev/null; then
    err "reset script not found: ${script}"
    return 1
  fi
  info "==> Resetting Docker data via ${script}"
  ATLANTISBOARD_ENV_FILE="${ENV_FILE:-${install_dir}/.env}" \
    atl_sudo env ATLANTISBOARD_ENV_FILE="${ENV_FILE:-${install_dir}/.env}" \
    bash "$script" "$reset_mode"
}
