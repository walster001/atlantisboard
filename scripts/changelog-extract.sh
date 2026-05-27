#!/usr/bin/env bash
# Extract release notes for VERSION from CHANGELOG.md (Keep a Changelog).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CHANGELOG="${PROJECT_ROOT}/CHANGELOG.md"

usage() {
  echo "Usage: scripts/changelog-extract.sh <version>" >&2
  echo "  version: semver without leading v (e.g. 1.2.3)" >&2
  exit 1
}

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  usage
fi

if [[ ! -f "$CHANGELOG" ]]; then
  echo "error: CHANGELOG.md not found at $CHANGELOG" >&2
  exit 1
fi

# Print section body for ## [x.y.z] until next ## heading.
awk -v ver="$VERSION" '
  BEGIN { found=0; printing=0 }
  /^## \[/ {
    if (printing) { exit }
    if ($0 ~ "^## \\[" ver "\\]") { found=1; printing=1; next }
  }
  printing { print }
  END {
    if (!found) {
      print "error: no ## [" ver "] section in CHANGELOG.md" > "/dev/stderr"
      exit 1
    }
  }
' "$CHANGELOG"
