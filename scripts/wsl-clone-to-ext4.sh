#!/usr/bin/env bash
# Copy this project onto the WSL ext4 filesystem (e.g. ~/projects/...) for better I/O than /mnt/... drvfs.
# Does not require git; optional second argument can be a git URL to clone instead.
#
# Usage:
#   ./scripts/wsl-clone-to-ext4.sh [TARGET_DIR] [GIT_URL_OR_EMPTY]
#
# Defaults:
#   TARGET_DIR  $HOME/projects/atlboard-new
#
# Examples:
#   ./scripts/wsl-clone-to-ext4.sh
#   ./scripts/wsl-clone-to-ext4.sh ~/projects/atlboard-new
#   ./scripts/wsl-clone-to-ext4.sh ~/projects/atlboard-new 'https://github.com/org/repo.git'   # git clone
#   cursor ~/projects/atlboard-new

set -euo pipefail

if [ -f /proc/version ] && grep -qi microsoft /proc/version 2>/dev/null; then
  :
else
  echo "Note: intended for WSL; copying to a fast local disk is still fine on native Linux."
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

TARGET_DIR="${1:-$HOME/projects/atlboard-new}"
ARG2="${2:-}"

# Second arg looks like a git remote → clone instead of copying a local tree
USE_GIT=false
if [ -n "$ARG2" ]; then
  if [[ "$ARG2" =~ ^(git@|https?://|ssh://) ]]; then
    USE_GIT=true
    GIT_URL="$ARG2"
  else
    echo "Second argument is not a git URL (expected git@..., https://..., ssh://...). Ignoring: $ARG2"
  fi
fi

mkdir -p "$(dirname "$TARGET_DIR")"

if [ "$USE_GIT" = true ]; then
  if [ -d "$TARGET_DIR/.git" ]; then
    echo "Already a git repo: $TARGET_DIR"
    echo "Pull latest: git -C \"$TARGET_DIR\" pull"
  else
    if [ -e "$TARGET_DIR" ]; then
      echo "Path exists but is not empty / not a git repo: $TARGET_DIR"
      echo "Remove it or choose a different TARGET_DIR."
      exit 1
    fi
    git clone "$GIT_URL" "$TARGET_DIR"
    echo "Cloned to: $TARGET_DIR"
  fi
else
  if ! command -v rsync >/dev/null 2>&1; then
    echo "rsync is required for a safe copy (excludes node_modules, etc.). Install with:"
    echo "  sudo apt install rsync"
    exit 1
  fi

  echo "Copying project (no git required):"
  echo "  from: $PROJECT_ROOT"
  echo "  to:   $TARGET_DIR"
  mkdir -p "$TARGET_DIR"
  rsync -a \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'dist' \
    --exclude '.bun' \
    --exclude 'coverage' \
    "$PROJECT_ROOT/" "$TARGET_DIR/"
  echo "Done."
fi

if [ -f "$PROJECT_ROOT/.env" ] && [ ! -f "$TARGET_DIR/.env" ]; then
  echo "Tip: copy your .env into the new tree:"
  echo "  cp \"$PROJECT_ROOT/.env\" \"$TARGET_DIR/.env\""
fi

echo ""
echo "Open in Cursor (from WSL or Windows terminal with cursor on PATH):"
echo "  cursor \"$TARGET_DIR\""
echo "Or in Cursor: File → Open Folder → $TARGET_DIR"
echo ""
echo "Then install deps on ext4: cd \"$TARGET_DIR\" && bun install"
