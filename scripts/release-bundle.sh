#!/usr/bin/env bash
# Build a production-ready release zip from the repository root (paths are anchored here).
# Optional: upload the zip to a GitHub Release (--upload-github + --tag or RELEASE_TAG).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

NO_CHECKS=false
UPLOAD_GITHUB=false
TAG=""
FAT_ZIP=false

usage() {
  cat <<'EOF'
Usage: scripts/release-bundle.sh [options]

  Builds: bun install --frozen-lockfile → build:client → build → release/kanboard-<version>.zip

Options:
  --no-checks       Skip lint, typecheck, and tests
  --upload-github   After building, publish the zip to GitHub Releases (requires gh CLI)
  --tag <ref>       Release tag (e.g. v1.2.3). Required with --upload-github unless RELEASE_TAG is set
  --fat-zip         Include production node_modules in the zip (larger; air-gapped friendly)

Environment:
  RELEASE_UPLOAD_GITHUB=1   Same as --upload-github
  RELEASE_TAG=<ref>         Same as --tag

Examples:
  ./scripts/release-bundle.sh
  bun run release:bundle -- --no-checks
  ./scripts/release-bundle.sh --upload-github --tag v1.0.0
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-checks)
      NO_CHECKS=true
      shift
      ;;
    --upload-github)
      UPLOAD_GITHUB=true
      shift
      ;;
    --tag)
      if [[ $# -lt 2 ]]; then
        echo "error: --tag requires a value" >&2
        exit 1
      fi
      TAG="$2"
      shift 2
      ;;
    --fat-zip)
      FAT_ZIP=true
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "${RELEASE_UPLOAD_GITHUB:-}" == "1" ]]; then
  UPLOAD_GITHUB=true
fi
if [[ -n "${RELEASE_TAG:-}" ]]; then
  TAG="${RELEASE_TAG}"
fi

if [[ "$UPLOAD_GITHUB" == true && -z "$TAG" ]]; then
  echo "error: --upload-github requires --tag or RELEASE_TAG (e.g. v1.0.0)" >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is not on PATH" >&2
  exit 1
fi

if [[ "$UPLOAD_GITHUB" == true ]] && ! command -v gh >/dev/null 2>&1; then
  echo "error: gh (GitHub CLI) is required for --upload-github" >&2
  exit 1
fi

VERSION="$(bun -e 'console.log((await Bun.file("package.json").json()).version)')"
if [[ -z "$VERSION" ]]; then
  echo "error: could not read version from package.json" >&2
  exit 1
fi

ZIP_NAME="kanboard-${VERSION}.zip"
ZIP_PATH="release/${ZIP_NAME}"

echo "==> Release bundle for kanboard ${VERSION}"
echo "==> Project root: ${PROJECT_ROOT}"

echo "==> bun install --frozen-lockfile"
bun install --frozen-lockfile

if [[ "$NO_CHECKS" != true ]]; then
  echo "==> lint"
  bun run lint
  echo "==> typecheck"
  bun run typecheck
  echo "==> test"
  bun test
else
  echo "==> skipping lint, typecheck, test (--no-checks)"
fi

echo "==> build:client"
bun run build:client

echo "==> build (server + client bundle + workers)"
bun run build

mkdir -p release

if [[ "$FAT_ZIP" == true ]]; then
  STAGE="$(mktemp -d "${TMPDIR:-/tmp}/kanboard-release-stage.XXXXXX")"
  cleanup_stage() {
    rm -rf "${STAGE:-}"
  }
  trap cleanup_stage EXIT
  echo "==> staging fat zip (with production dependencies)"
  rm -f "$ZIP_PATH"
  cp -a dist public package.json bun.lock README.md DEPLOYMENT.md "$STAGE/"
  (cd "$STAGE" && bun install --frozen-lockfile --production)
  (cd "$STAGE" && zip -qr "${PROJECT_ROOT}/${ZIP_PATH}" .)
  trap - EXIT
  cleanup_stage
else
  echo "==> slim zip (extract then run: bun install --production)"
  rm -f "$ZIP_PATH"
  zip -qr "$ZIP_PATH" dist public package.json bun.lock README.md DEPLOYMENT.md
fi

echo "==> wrote ${ZIP_PATH}"

if [[ "$UPLOAD_GITHUB" == true ]]; then
  echo "==> GitHub upload for tag ${TAG}"
  gh auth status >/dev/null

  if gh release view "$TAG" >/dev/null 2>&1; then
    echo "==> release exists; uploading asset"
  else
    echo "==> creating release ${TAG}"
    gh release create "$TAG" --title "Release ${TAG}" --generate-notes
  fi

  gh release upload "$TAG" "$ZIP_PATH" --clobber
  echo "==> uploaded ${ZIP_NAME} to ${TAG}"
fi
