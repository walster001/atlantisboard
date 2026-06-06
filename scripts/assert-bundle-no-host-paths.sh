#!/usr/bin/env sh
# Fail when a Bun server/worker bundle embeds absolute host paths (CI runner or dev machine).
set -eu

if [ "$#" -lt 1 ]; then
  echo "usage: $0 <bundle.js> [bundle.js...]" >&2
  exit 2
fi

for file in "$@"; do
  if [ ! -f "$file" ]; then
    echo "error: bundle missing: ${file}" >&2
    exit 1
  fi
  if grep -q 'runner/work/' "$file" 2>/dev/null; then
    echo "error: ${file} embeds GitHub Actions paths (use bun build --packages=external)" >&2
    exit 1
  fi
  if grep -qE '/(home|Users)/[^/[:space:]"'\''`]+/node_modules/' "$file" 2>/dev/null; then
    echo "error: ${file} embeds absolute node_modules paths (use bun build --packages=external)" >&2
    exit 1
  fi
done

echo "==> Bundle path check OK ($# file(s))"
