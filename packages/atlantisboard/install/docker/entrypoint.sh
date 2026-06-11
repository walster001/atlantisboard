#!/bin/sh
# ClamAV: seed signatures, optionally start clamd when MemAvailable ≥ 2GB, else on-demand clamscan.
set -eu

clamav_db_dir="${CLAMAV_DB_DIR:-/var/lib/clamav}"
clamav_seed_dir="/opt/clamav-seed"
clamd_conf="/tmp/clamd.conf"
clamd_pid_file="/tmp/clamd.pid"
clamd_min_ram_mb="${POMPELMI_CLAMD_MIN_RAM_MB:-2048}"
clamd_port="${POMPELMI_CLAMD_PORT:-3310}"
freshclam_min_interval_ms="${POMPELMI_SIGNATURE_REFRESH_MS:-86400000}"

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

freshclam_recently_updated() {
  dat="$clamav_db_dir/freshclam.dat"
  if [ ! -f "$dat" ]; then
    return 1
  fi
  now="$(date +%s)"
  mtime="$(stat -c %Y "$dat" 2>/dev/null || echo 0)"
  age_ms=$(( (now - mtime) * 1000 ))
  if [ "$age_ms" -lt "$freshclam_min_interval_ms" ]; then
    return 0
  fi
  return 1
}

cleanup_clamav_db_dir() {
  for f in "$clamav_db_dir"/*.cud "$clamav_db_dir"/*.tmp \
    "$clamav_db_dir"/*.part "$clamav_db_dir"/*.lock "$clamav_db_dir"/*~; do
    [ -e "$f" ] || continue
    rm -f "$f"
  done
  for base in main daily bytecode; do
    if [ -f "$clamav_db_dir/${base}.cvd" ] && [ -f "$clamav_db_dir/${base}.cld" ]; then
      rm -f "$clamav_db_dir/${base}.cld"
    fi
  done
}

read_mem_available_kb() {
  if [ -r /proc/meminfo ]; then
    awk '/^MemAvailable:/ {print $2; exit}' /proc/meminfo 2>/dev/null || echo 0
  else
    echo 0
  fi
}

should_start_clamd() {
  if [ "${POMPELMI_SKIP_SCAN:-false}" = "true" ]; then
    return 1
  fi

  use_clamd="${POMPELMI_USE_CLAMD:-auto}"
  case "$use_clamd" in
    true|TRUE|1|yes|YES)
      return 0
      ;;
    false|FALSE|0|no|NO)
      return 1
      ;;
  esac

  avail_kb="$(read_mem_available_kb)"
  min_kb=$((clamd_min_ram_mb * 1024))
  if [ "$avail_kb" -ge "$min_kb" ]; then
    return 0
  fi
  return 1
}

write_clamd_config() {
  cat > "$clamd_conf" <<EOF
DatabaseDirectory $clamav_db_dir
LogFile /dev/null
LogTime no
PidFile $clamd_pid_file
TCPSocket $clamd_port
TCPAddr 127.0.0.1
Foreground no
EOF
}

wait_for_clamd() {
  i=0
  while [ "$i" -lt 30 ]; do
    if clamdscan --ping >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  return 1
}

start_clamd_if_allowed() {
  if ! should_start_clamd; then
    export POMPELMI_USE_CLAMD=false
    return 0
  fi

  if ! command -v clamd >/dev/null 2>&1; then
    echo "warning: clamd not installed; falling back to on-demand clamscan" >&2
    export POMPELMI_USE_CLAMD=false
    return 0
  fi

  write_clamd_config
  if ! clamd --config-file="$clamd_conf"; then
    echo "warning: clamd failed to start; falling back to on-demand clamscan" >&2
    export POMPELMI_USE_CLAMD=false
    return 0
  fi

  if ! wait_for_clamd; then
    echo "warning: clamd did not become ready; falling back to on-demand clamscan" >&2
    export POMPELMI_USE_CLAMD=false
    return 0
  fi

  export POMPELMI_USE_CLAMD=true
  export POMPELMI_CLAMD_HOST=127.0.0.1
  export POMPELMI_CLAMD_PORT="$clamd_port"
  export POMPELMI_CLAMD_PID_FILE="$clamd_pid_file"
  echo "clamd started (MemAvailable ≥ ${clamd_min_ram_mb}MB or POMPELMI_USE_CLAMD=true)" >&2
}

if [ "${POMPELMI_SKIP_SCAN:-false}" != "true" ]; then
  mkdir -p "$clamav_db_dir"
  if [ "$(id -u)" = "0" ]; then
    chown -R bunjs:nodejs "$clamav_db_dir"
    if ! has_sigs; then
      seed_clamav_db_from_image || true
    fi
    if ! has_sigs && ! freshclam_recently_updated; then
      if freshclam --stdout; then
        cleanup_clamav_db_dir
      fi
      chown -R bunjs:nodejs "$clamav_db_dir"
    fi
    if ! has_sigs; then
      echo "warning: ClamAV signatures are not available; uploads may be blocked until freshclam succeeds" >&2
    fi
    start_clamd_if_allowed
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
