---
name: Fix Wekan Color Mapping with Distance Algorithm
overview: Fix Wekan color import mapping by expanding the color map with CSS color names and implementing a color distance algorithm to find the closest hex match for unmapped color names, ensuring all Wekan colors map to visually similar colors instead of defaulting to gray.
todos:
  - id: expand-wekan-colormap
    content: Expand wekanColorMap with comprehensive CSS/HTML color names (140+ colors), keeping existing 13 Wekan colors
    status: completed
  - id: create-css-palette
    content: Create cssColorPalette constant with all CSS color names and hex values for distance algorithm reference
    status: completed
  - id: implement-color-helpers
    content: Implement hexToRgb(), colorDistance(), and findClosestColor() helper functions
    status: completed
    dependencies:
      - create-css-palette
  - id: update-getwekancolor
    content: Update getWekanColor() function to use expanded map and distance algorithm for unmapped colors
    status: completed
    dependencies:
      - expand-wekan-colormap
      - create-css-palette
      - implement-color-helpers
  - id: test-color-mapping
    content: "Test color mapping with various inputs: known Wekan colors, CSS colors, unmapped names, hex values, invalid inputs"
    status: completed
    dependencies:
      - update-getwekancolor
---

# Fix Wekan Color

Mapping with Distance Algorithm

## Context

### Current Issue

The `getWekanColor()` function in `backend/src/services/board-import.service.ts` only maps 13 color names. When a Wekan color name isn't found in the map, it falls back to default gray (`#838c91`), resulting in incorrect color mappings.

### Current Implementation

- **File**: `backend/src/services/board-import.service.ts`
- **Current map**: 13 colors (green, yellow, orange, red, purple, blue, sky, lime, pink, black, white, navy, default)
- **Fallback**: Always returns `#838c91` (gray) for unmapped colors
- **Used for**: Labels (line 387), cards (line 493), boards (line 340)

### Solution Strategy

1. Expand `wekanColorMap` with comprehensive CSS/HTML color names (140+ colors)
2. Implement color distance algorithm (Euclidean distance in RGB space)
3. For unmapped colors, find closest match from CSS color palette
4. Ensure all color mappings result in valid hex colors

## Implementation Plan

### 1. Expand Wekan Color Map

**File**: `backend/src/services/board-import.service.ts`Expand `wekanColorMap` (starting at line 44) to include:

- Existing 13 Wekan colors (keep current mappings)
- Comprehensive CSS/HTML color names (140+ colors from W3C standard)
- Common color variants (light, dark, etc.)

### 2. Create CSS Color Name Palette

**File**: `backend/src/services/board-import.service.ts`Create a separate `cssColorPalette` constant containing all CSS color names with their hex values. This will serve as the reference palette for distance calculations.

### 3. Implement Color Distance Algorithm

**File**: `backend/src/services/board-import.service.ts`Add helper functions:

- `hexToRgb(hex: string): { r: number, g: number, b: number } | null` - Convert hex to RGB
- `colorDistance(color1: { r: number, g: number, b: number }, color2: { r: number, g: number, b: number }): number` - Calculate Euclidean distance
- `findClosestColor(targetHex: string, palette: Record<string, string>): string` - Find closest color from palette

### 4. Update getWekanColor Function

**File**: `backend/src/services/board-import.service.ts` (line 60)Modify `getWekanColor()` to:

1. Handle null/undefined/empty (return default)
2. Validate and return hex colors as-is
3. Check expanded `wekanColorMap` for exact match
4. If not found, use color name to hex lookup (CSS color names)
5. If still not found, try to parse as CSS color name and find closest match using distance algorithm
6. Final fallback: return default gray

### 5. Handle Edge Cases

- Invalid hex formats → validate and return default
- Color names with spaces/underscores → normalize before lookup
- Case insensitivity → normalize to lowercase
- RGB/RGBA values → convert to hex first, then process

## Files to Modify

1. `backend/src/services/board-import.service.ts`

- Expand `wekanColorMap` (line 44)
- Add `cssColorPalette` constant
- Add color distance helper functions
- Update `getWekanColor()` function (line 60)

## Testing Considerations

- Test with known Wekan color names (existing 13 colors)
- Test with CSS color names (red, blue, aqua, etc.)
- Test with unmapped color names (should find closest match)
- Test with hex colors (should pass through unchanged)
- Test with invalid inputs (null, undefined, empty, invalid hex)
- Verify labels, cards, and boards import with correct colors
- Ensure no colors default to gray unless explicitly requested

## Algorithm Details

**Color Distance Calculation**:

- Use Euclidean distance in RGB color space
- Formula: `√[(R1-R2)² + (G1-G2)² + (B1-B2)²]`
- Lower distance = closer match
- Compare against all colors in CSS palette to find minimum distance

**Color Name Resolution**:

1. Normalize input (lowercase, trim)
2. Check expanded `wekanColorMap` first (fast lookup)
3. Check `cssColorPalette` by name