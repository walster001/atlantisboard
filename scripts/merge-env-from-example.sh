#!/usr/bin/env bash
# Append missing KEY=value entries from a template (.env.example) into an existing .env
# without overwriting values already set on the target file.
set -euo pipefail

TEMPLATE=""
TARGET=""
DRY_RUN=false

usage() {
  cat <<'EOF'
Usage: merge-env-from-example.sh --template PATH --target PATH [--dry-run]

Compares active KEY=value lines in --template against --target and appends any
missing keys (values taken from the template). Existing target keys are never changed.
EOF
}

die() {
  printf 'merge-env-from-example: %s\n' "$*" >&2
  exit 1
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --template)
        TEMPLATE="$2"
        shift 2
        ;;
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

  [[ -n "$TEMPLATE" ]] || die "--template is required"
  [[ -n "$TARGET" ]] || die "--target is required"
  [[ -f "$TEMPLATE" ]] || die "Template not found: $TEMPLATE"
}

# Returns 0 if target file contains a line ^KEY=
key_present_in_target() {
  local key="$1"
  local file="$2"
  [[ -f "$file" ]] || return 1
  grep -qE "^${key}=" "$file" 2>/dev/null
}

# Collect active KEY=value lines from template (non-comment, non-empty).
# Output: one "KEY<TAB>value" per line (value is everything after first =).
parse_template_keys() {
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" ]] && continue
    [[ "$line" == \#* ]] && continue
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      value="${BASH_REMATCH[2]}"
      printf '%s\t%s\n' "$key" "$value"
    fi
  done < "$TEMPLATE"
}

main() {
  parse_args "$@"

  local -a add_lines=()
  local -a add_keys=()
  local key value

  if [[ ! -f "$TARGET" ]]; then
    if [[ "$DRY_RUN" == true ]]; then
      printf 'Would create %s from template (mode 600)\n' "$TARGET"
      exit 0
    fi
    install -m 600 "$TEMPLATE" "$TARGET"
    printf 'Created %s from template (mode 600)\n' "$TARGET"
    exit 0
  fi

  while IFS=$'\t' read -r key value; do
    [[ -n "$key" ]] || continue
    if key_present_in_target "$key" "$TARGET"; then
      continue
    fi
    add_keys+=("$key")
    add_lines+=("${key}=${value}")
  done < <(parse_template_keys)

  if [[ "${#add_keys[@]}" -eq 0 ]]; then
    printf 'no new variables\n'
    exit 0
  fi

  local merge_date block
  merge_date="$(date '+%Y-%m-%d')"
  block="# --- Added by merge-env-from-example (${merge_date}) ---"

  if [[ "$DRY_RUN" == true ]]; then
    printf 'Would append %d key(s) to %s:\n' "${#add_keys[@]}" "$TARGET"
    for key in "${add_keys[@]}"; do
      printf '  + %s\n' "$key"
    done
    exit 0
  fi

  {
    printf '\n%s\n' "$block"
    local line
    for line in "${add_lines[@]}"; do
      printf '%s\n' "$line"
    done
  } >> "$TARGET"

  for key in "${add_keys[@]}"; do
    printf 'Added env variable: %s\n' "$key"
  done
}

main "$@"
