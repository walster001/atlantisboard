---
name: Fix inline button conversion and HTML entity decoding
overview: "Fix two issues in MarkdownRenderer: (1) Make inline button conversion more reliable and ensure links are only converted after inline buttons are handled, (2) Fix double-unescape bug where HTML entities may be decoded incorrectly."
todos:
  - id: improve-inline-button-regex
    content: Update convertLegacyInlineButtons regex patterns to match import code style (display:\s*inline-?flex) and support both single/double quotes
    status: completed
  - id: fix-link-conversion-quotes
    content: Update link conversion regex in htmlToMarkdown to support both single and double quotes (href=["']([^"']*)["'])
    status: completed
    dependencies:
      - improve-inline-button-regex
  - id: fix-entity-decoding-order
    content: Move HTML entity decoding from end of htmlToMarkdown to beginning (after inline button conversion) to prevent double-unescape
    status: completed
  - id: verify-processing-order
    content: Verify that inline button conversion runs before link conversion and entity decoding runs before content extraction
    status: completed
    dependencies:
      - improve-inline-button-regex
      - fix-link-conversion-quotes
      - fix-entity-decoding-order
---

# Fix Inline Button Conversion and HTML Entity Decoding

## Problem Analysis

### Issue 1: Inline Buttons Showing as Hyperlinks

The `htmlToMarkdown` function in [`src/components/kanban/MarkdownRenderer.tsx`](src/components/kanban/MarkdownRenderer.tsx) has a processing order issue:

1. `convertLegacyInlineButtons()` runs first (line 255) but may fail to match inline button HTML due to:

- Regex pattern differences: uses `display\s*:\s*inline-?flex` while import code uses `display:\s*inline-?flex`
- Only matches double quotes in some patterns, not single quotes
- If conversion fails, inline button HTML remains unchanged

2. Link conversion (line 292) converts ALL `<a>` tags, including ones inside inline button spans that weren't converted:

- Only matches double quotes: `href="([^"]*)"` - misses single-quoted hrefs
- Doesn't check if link is inside an inline button span

### Issue 2: Double-Unescape Bug (Line 314-320)

HTML entity decoding happens at the end after all tag processing. If entities are already in the extracted content, they may be decoded incorrectly. The current flow extracts content (which may contain entities like `&amp;`) and then decodes entities at the end, which could cause issues if entities appear in unexpected places.

## Solution

### 1. Improve `convertLegacyInlineButtons` Function

**Location**: [`src/components/kanban/MarkdownRenderer.tsx`](src/components/kanban/MarkdownRenderer.tsx) lines 167-216**Changes**:

- Align regex pattern with import code: use `display:\s*inline-?flex` (colon with optional space before)
- Support both single and double quotes consistently in all regex patterns
- Make the regex more robust to handle spacing variations
- Add better error handling/logging if conversion fails

### 2. Fix Link Conversion in `htmlToMarkdown`

**Location**: [`src/components/kanban/MarkdownRenderer.tsx`](src/components/kanban/MarkdownRenderer.tsx) line 292**Changes**:

- Support both single and double quotes: change regex to `href=["']([^"']*)["']`
- Convert links ONLY if they're not inside inline button spans (check context)
- Alternatively: ensure inline buttons are converted first, then convert remaining links (simpler approach)

**Preferred approach**: Make inline button conversion more reliable, then convert all remaining links. This is simpler than context-aware link conversion.

### 3. Fix HTML Entity Decoding Order

**Location**: [`src/components/kanban/MarkdownRenderer.tsx`](src/components/kanban/MarkdownRenderer.tsx) lines 314-320**Changes**:

- Move HTML entity decoding to happen BEFORE extracting content into markdown
- Or: Only decode entities that are NOT part of the extracted content
- Best approach: Decode entities first, then process HTML tags (prevents double-decoding of entities in extracted content)

## Implementation Steps

1. **Update `convertLegacyInlineButtons` regex patterns**:

- Change `display\s*:\s*inline-?flex` to `display:\s*inline-?flex` (match import code)
- Ensure all patterns support both `['"]` for quotes
- Test with various Wekan HTML formats

2. **Update link conversion regex**:

- Change from `href="([^"]*)"` to `href=["']([^"']*)["']` to support both quote types
- Ensure this runs after inline button conversion (already does, but verify)

3. **Fix HTML entity decoding**:

- Move entity decoding (lines 314-320) to the beginning of `htmlToMarkdown`, right after the inline button conversion
- This ensures entities are decoded before content extraction
- Remove the entity decoding from the end of the function

4. **Add defensive checks**:

- Ensure `convertLegacyInlineButtons` runs before any link conversion
- Add a check to skip link conversion if content contains unconverted inline button markers (though ideally this shouldn't happen)

## Files to Modify

- [`src/components/kanban/MarkdownRenderer.tsx`](src/components/kanban/MarkdownRenderer.tsx):
- `convertLegacyInlineButtons` function (lines 167-216)
- `htmlToMarkdown` function (lines 249-323)
- Specifically: line 185 (regex pattern), line 292 (link regex), lines 314-320 (entity decoding)

## Testing Considerations

- Test with Wekan HTML containing inline buttons with various quote styles (single/double)
- Test with inline buttons that have different spacing in style attributes
- Test HTML entity decoding with various entity types