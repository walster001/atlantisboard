#!/usr/bin/env bash
# FS-001 creep gate: fail when any src/**/*.ts(x) reaches the 480-line soft cap.
# Hard gate remains 500 lines (see code-review-output-310526.md X-005, X-006).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
THRESHOLD="${THRESHOLD:-480}"

cd "$ROOT"

mapfile -t violations < <(
  find src -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 |
    xargs -0 wc -l |
    awk -v limit="$THRESHOLD" '$1 >= limit && $2 ~ /^src\// { print $0 }' |
    sort -rn
)

if ((${#violations[@]} > 0)); then
  echo "ERROR: ${#violations[@]} src/**/*.ts(x) file(s) at or above ${THRESHOLD} lines (FS-001 creep gate):" >&2
  printf '%s\n' "${violations[@]}" >&2
  echo >&2
  echo "Decompose listed files or raise THRESHOLD only after explicit review." >&2
  exit 1
fi

echo "OK: no src/**/*.ts(x) files >= ${THRESHOLD} lines"
