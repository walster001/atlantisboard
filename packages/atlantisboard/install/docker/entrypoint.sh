#!/bin/sh
# On-demand clamscan: ensure signature dir exists (and optional first freshclam as root).
set -eu

clamav_db_dir="${CLAMAV_DB_DIR:-/var/lib/clamav}"

has_sigs() {
  for f in main.cvd main.cld daily.cvd daily.cld; do
    if [ -f "$clamav_db_dir/$f" ]; then
      return 0
    fi
  done
  return 1
}

if [ "${POMPELMI_SKIP_SCAN:-false}" != "true" ]; then
  mkdir -p "$clamav_db_dir"
  if [ "$(id -u)" = "0" ]; then
    chown -R bunjs:nodejs "$clamav_db_dir"
    if ! has_sigs; then
      freshclam --stdout || true
      chown -R bunjs:nodejs "$clamav_db_dir"
    fi
  fi
fi

if [ "$(id -u)" = "0" ]; then
  exec su-exec bunjs:nodejs "$@"
fi

exec "$@"
