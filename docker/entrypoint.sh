#!/bin/sh
# On-demand clamscan: seed signatures from the image, then optional freshclam as root.
set -eu

clamav_db_dir="${CLAMAV_DB_DIR:-/var/lib/clamav}"
clamav_seed_dir="/opt/clamav-seed"

has_sigs_in() {
  dir="$1"
  for f in main.cvd main.cld daily.cvd daily.cld; do
    if [ -f "$dir/$f" ]; then
      return 0
    fi
  done
  return 1
}

has_sigs() {
  has_sigs_in "$clamav_db_dir"
}

seed_clamav_db_from_image() {
  if [ ! -d "$clamav_seed_dir" ]; then
    return 1
  fi
  if ! has_sigs_in "$clamav_seed_dir"; then
    return 1
  fi
  cp -a "$clamav_seed_dir/." "$clamav_db_dir/"
  return 0
}

if [ "${POMPELMI_SKIP_SCAN:-false}" != "true" ]; then
  mkdir -p "$clamav_db_dir"
  if [ "$(id -u)" = "0" ]; then
    chown -R bunjs:nodejs "$clamav_db_dir"
    if ! has_sigs; then
      seed_clamav_db_from_image || true
    fi
    if ! has_sigs; then
      freshclam --stdout || true
      chown -R bunjs:nodejs "$clamav_db_dir"
    fi
    if ! has_sigs; then
      echo "warning: ClamAV signatures are not available; uploads may be blocked until freshclam succeeds" >&2
    fi
  fi
fi

backup_dir="${BACKUP_LOCATION:-/data/backups}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$backup_dir"
  chown bunjs:nodejs "$backup_dir"
  if [ -f /app/.env ]; then
    chown bunjs:nodejs /app/.env
    chmod u+w /app/.env
  fi
fi

if [ "$(id -u)" = "0" ]; then
  exec su-exec bunjs:nodejs "$@"
fi

exec "$@"
