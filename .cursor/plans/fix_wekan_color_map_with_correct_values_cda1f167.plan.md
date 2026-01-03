---
name: Fix Wekan Color Map with Correct Values
overview: Remove the expanded CSS color palette and color distance algorithm. Extract the correct Wekan color values from the official Wekan CSS file and update wekanColorMap with the accurate 24 card colors and 25 label colors (including white).
todos:
  - id: remove-css-palette
    content: Remove cssColorPalette constant and all references to it
    status: completed
  - id: remove-color-helpers
    content: Remove hexToRgb(), colorDistance(), and findClosestColor() helper functions
    status: completed
  - id: extract-wekan-colors
    content: Extract all 25 Wekan label colors from CSS file and normalize hex values (3-digit to 6-digit)
    status: completed
  - id: update-wekan-colormap
    content: Replace wekanColorMap with correct Wekan color values from CSS file
    status: completed
    dependencies:
      - extract-wekan-colors
  - id: simplify-getwekancolor
    content: Simplify getWekanColor() function to remove CSS palette references and variation logic
    status: completed
    dependencies:
      - remove-css-palette
      - remove-color-helpers
      - update-wekan-colormap
---

# Fix Wekan Color Map with Correct Values

## Context

### Current Issue

The `wekanColorMap` contains incorrect color values and includes an unnecessary expanded CSS color palette. The current implementation:

- Uses wrong hex values for many Wekan colors (e.g., green is `#61bd4f` but should be `#3cb500`)
- Includes 140+ CSS colors that aren't used by Wekan
- Has unnecessary color distance algorithm functions
- Overcomplicates the color mapping logic

### Correct Wekan Colors

Based on the official Wekan CSS file ([labels.css](https://github.com/wekan/wekan/blob/2325a5c5322357103af1794c3a0a499e78d8d142/client/components/cards/labels.css)), Wekan supports:

- **25 label colors** (including white)
- **24 card colors** (excluding white)

The CSS defines colors as `.card-label-{colorname}` with `background-color` values.

### Solution

1. Remove `cssColorPalette` constant
2. Remove color helper functions (`hexToRgb`, `colorDistance`, `findClosestColor`)
3. Extract correct Wekan color values from the CSS file
4. Update `wekanColorMap` with only the correct Wekan colors
5. Simplify `getWekanColor()` function to use only `wekanColorMap`

## Implementation Plan

### 1. Extract Wekan Colors from CSS

From the CSS file, extract all `.card-label-*` classes and their `background-color` values:

- white: `#ffffff` (from `#fff`)
- green: `#3cb500`
- yellow: `#fad900`
- orange: `#ff9f19`
- red: `#eb4646`
- purple: `#a632db`
- blue: `#0079bf`
- pink: `#ff78cb`
- sky: `#00c2e0`
- black: `#4d4d4d`
- lime: `#51e898`
- silver: `#c0c0c0`
- peachpuff: `#ffdab9`
- crimson: `#dc143c`
- plum: `#dda0dd`
- darkgreen: `#006400`
- slateblue: `#6a5acd`
- magenta: `#ff00ff` (from `#f0f`)
- gold: `#ffd700`
- navy: `#000080`
- gray: `#808080`
- saddlebrown: `#8b4513`
- paleturquoise: `#afeeee`
- mistyrose: `#ffe4e1`
- indigo: `#4b0082`

Total: 25 colors for labels, 24 for cards (cards exclude white).

### 2. Remove Unnecessary Code

**File**: `backend/src/services/board-import.service.ts`

- Remove `cssColorPalette` constant (lines 44-201)
- Remove `hexToRgb()` function (lines 223-246)
- Remove `colorDistance()` function (lines 248-257)
- Remove `findClosestColor()` function (lines 259-281)
- Remove spread of `cssColorPalette` in `wekanColorMap`

### 3. Update wekanColorMap

**File**: `backend/src/services/board-import.service.ts` (line 44)Replace `wekanColorMap` with the correct Wekan colors:

- Keep `default: '#838c91'` as fallback
- Update all color values to match Wekan CSS
- Include all 25 label colors (including white)
- Ensure 3-digit hex values are expanded to 6 digits (e.g., `#f0f` → `#ff00ff`, `#fff` → `#ffffff`)

### 4. Simplify getWekanColor Function

**File**: `backend/src/services/board-import.service.ts` (line 60)Simplify the function to:

1. Handle null/undefined/empty → return default
2. Normalize input (lowercase, trim, handle spaces/underscores)
3. Validate hex colors → return as-is (expand 3-digit to 6-digit)
4. Look up in `wekanColorMap` → return mapped value
5. Fallback → return default

Remove:

- References to `cssColorPalette`
- Color variation logic (not needed with exact Wekan colors)
- Distance algorithm calls

### 5. Update Color Values

Key corrections needed:

- green: `#61bd4f` → `#3cb500`
- yellow: `#f2d600` → `#fad900`
- orange: `#ff9f1a` → `#ff9f19` (minor change)
- red: `#eb5a46` → `#eb4646`
- purple: `#c377e0` → `#a632db`
- black: `#344563` → `#4d4d4d`
- white: `#b3bac5` → `#ffffff`
- navy: `#026aa7` → `#000080`

## Files to Modify

1. `backend/src/services/board-import.service.ts`

- Remove `cssColorPalette` constant
- Remove color helper functions
- Update `wekanColorMap` with correct Wekan colors
- Simplify `getWekanColor()` function

## Testing Considerations

- Verify all 25 Wekan label colors map correctly
- Verify all 24 Wekan card colors map correctly (excluding white)
- Test with known Wekan color names
- Test with hex colors (should pass through)