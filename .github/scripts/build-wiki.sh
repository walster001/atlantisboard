#!/usr/bin/env bash
# build-wiki.sh — Preprocess docs/wiki/ into pages/wiki/ for Jekyll.
#
# Transforms:
#   1. Copies all *.md files from docs/wiki/ → pages/wiki/
#   2. Converts relative Markdown links:  [text](other-page.md) → [text](/wiki/other-page/)
#   3. Converts image paths:  (images/foo.png) → (/assets/wiki/foo.png)
#   4. Copies docs/wiki/images/ → pages/assets/wiki/
#   5. Handles Home.md specially → pages/wiki.md (the wiki index)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WIKI_SRC="${REPO_ROOT}/docs/wiki"
WIKI_DEST="${REPO_ROOT}/pages/wiki"
IMAGES_SRC="${WIKI_SRC}/images"
IMAGES_DEST="${REPO_ROOT}/pages/assets/wiki"

echo "==> Wiki build: ${WIKI_SRC} → ${WIKI_DEST}"

if [ ! -d "${WIKI_SRC}" ]; then
  echo "ERROR: Source directory ${WIKI_SRC} does not exist."
  exit 1
fi

mkdir -p "${WIKI_DEST}"
mkdir -p "${IMAGES_DEST}"

# Copy images
if [ -d "${IMAGES_SRC}" ]; then
  echo "==> Copying images..."
  cp -r "${IMAGES_SRC}/." "${IMAGES_DEST}/"
  IMAGE_COUNT=$(find "${IMAGES_DEST}" -type f | wc -l)
  echo "    Copied ${IMAGE_COUNT} image files."
fi

transform_links() {
  local file="$1"
  local content
  content=$(<"${file}")

  # Convert relative .md links: [text](other-page.md) → [text](/wiki/other-page/)
  # Also handles [text](other-page.md#anchor) → [text](/wiki/other-page/#anchor)
  content=$(echo "${content}" | sed -E 's/\]\(([a-zA-Z0-9_-]+)\.md(#[^)]+)?\)/](\/wiki\/\1\/\2)/g')

  # Convert image paths: (images/foo.png) → (/assets/wiki/foo.png)
  content=$(echo "${content}" | sed -E 's/\(images\/([^)]+)\)/(\/assets\/wiki\/\1)/g')

  echo "${content}"
}

PAGE_COUNT=0

for md_file in "${WIKI_SRC}"/*.md; do
  [ -f "${md_file}" ] || continue

  filename=$(basename "${md_file}")

  if [ "${filename}" = "Home.md" ]; then
    echo "==> Processing Home.md → pages/wiki.md (wiki index)"
    transform_links "${md_file}" > "${REPO_ROOT}/pages/wiki.md"
    PAGE_COUNT=$((PAGE_COUNT + 1))
    continue
  fi

  echo "    Processing ${filename}"
  transform_links "${md_file}" > "${WIKI_DEST}/${filename}"
  PAGE_COUNT=$((PAGE_COUNT + 1))
done

echo "==> Wiki build complete: ${PAGE_COUNT} pages processed."
