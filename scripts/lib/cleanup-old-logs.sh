#!/usr/bin/env bash
# Delete log files in DIR matching GLOB older than RETAIN_DAYS (default 7).

cleanup_old_logs() {
  local dir="${1:?dir required}"
  local pattern="${2:-*.log}"
  local days="${3:-7}"
  [[ -d "$dir" ]] || return 0
  find "$dir" -maxdepth 1 -name "$pattern" -type f -mtime +"$days" -delete 2>/dev/null || true
}
