#!/usr/bin/env bash
# Remove duplicate KEY=value assignments from a .env file (keeps the first occurrence).
set -euo pipefail

TARGET=""
DRY_RUN=false

usage() {
  cat <<'EOF'
Usage: dedupe-env-file.sh --target PATH [--dry-run]

Keeps comments, blanks, and the first assignment for each env key.
Later duplicate keys (e.g. from merge-env-from-example) are dropped.
EOF
}

die() {
  printf 'dedupe-env-file: %s\n' "$*" >&2
  exit 1
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --target)
        TARGET="$2"
        shift 2
        ;;
      --dry-run)
        DRY_RUN=true
        shift
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        die "Unknown option: $1"
        ;;
    esac
  done
  [[ -n "$TARGET" ]] || die "--target is required"
  [[ -f "$TARGET" ]] || die "Target not found: $TARGET"
}

# Match KEY= at line start (optional leading whitespace or export).
parse_env_key_from_line() {
  local line="$1"
  if [[ "$line" =~ ^[[:space:]]*export[[:space:]]+([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*= ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*= ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}

main() {
  parse_args "$@"

  local line key
  local -A seen_keys=()
  local -a out_lines=()
  local removed=0

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if parse_env_key_from_line "$line" >/dev/null 2>&1; then
      key="$(parse_env_key_from_line "$line")"
      if [[ -n "${seen_keys[$key]:-}" ]]; then
        removed=$((removed + 1))
        continue
      fi
      seen_keys["$key"]=1
    fi
    out_lines+=("$line")
  done < "$TARGET"

  if [[ "$removed" -eq 0 ]]; then
    printf 'no duplicate keys\n'
    exit 0
  fi

  if [[ "$DRY_RUN" == true ]]; then
    printf 'Would remove %d duplicate key line(s) from %s\n' "$removed" "$TARGET"
    exit 0
  fi

  local tmp mode
  tmp="$(mktemp)"
  mode="$(stat -c '%a' "$TARGET" 2>/dev/null || printf '600')"
  printf '%s\n' "${out_lines[@]}" > "$tmp"
  install -m "$mode" "$tmp" "$TARGET"
  rm -f "$tmp"
  printf 'Removed %d duplicate key line(s) from %s (kept first occurrence per key)\n' "$removed" "$TARGET"
}

main "$@"
