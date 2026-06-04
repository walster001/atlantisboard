#!/usr/bin/env bash
# Fail if atlantisboard@VERSION is already on the npm registry.
set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: scripts/release-check-npm-version.sh <semver>" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm is required" >&2
  exit 1
fi

if npm view "atlantisboard@${VERSION}" version >/dev/null 2>&1; then
  if [[ "${FAIL_IF_PUBLISHED:-0}" == "1" ]]; then
    echo "error: atlantisboard@${VERSION} is already published on npm." >&2
    echo "Bump version in package.json and CHANGELOG.md, then re-run Deploy to Production." >&2
    exit 1
  fi
  echo "published"
  exit 0
fi

echo "unpublished"
