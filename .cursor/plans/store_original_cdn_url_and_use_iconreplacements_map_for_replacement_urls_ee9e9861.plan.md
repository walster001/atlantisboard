---
name: Store original /cdn URL and use iconReplacements map for replacement URLs
overview: Fix the inline button icon import to properly use replacement URLs from the iconReplacements map by storing the original /cdn URL and looking up the replacement URL (newly uploaded MinIO icon) when converting placeholders back to inline buttons.
todos:
  - id: update-interface
    content: Add originalIconUrl field to InlineButtonPlaceholderData interface
    status: completed
  - id: update-convert-function
    content: Modify convertInlineButtonsToPlaceholders to extract and store original /cdn URL, handling both cases (HTML with /cdn and HTML with replacement URLs)
    status: completed
    dependencies:
      - update-interface
  - id: update-placeholder-conversion
    content: Modify placeholder conversion logic to look up replacement URL from iconReplacements map using original /cdn URL
    status: completed
    dependencies:
      - update-interface
      - update-convert-function
---

# Store Original /cdn URL and Use iconReplacements Map for Replacement URLs

## Problem

The backend is storing broken `/cdn` URLs in inline button placeholders instead of using the replacement URLs (newly uploaded icons from MinIO) from the `iconReplacements` map. The `/cdn` URLs are only for reference to identify which icon was replaced, but the actual replacement URLs from MinIO should be used in the final buttons.

## Solution

1. Store the original `/cdn` URL in the button data for lookup purposes
2. When converting placeholders back to inline buttons, look up the replacement URL from `iconReplacements` map using the original `/cdn` URL
3. Always use the replacement URL from the map (the newly uploaded icon from MinIO), never the original `/cdn` URL

## Implementation

### File to Modify

- [`backend/src/services/board-import.service.ts`](backend/src/services/board-import.service.ts)

### Changes

#### 1. Update Interface (lines 195-203)

Add `originalIconUrl` field to `InlineButtonPlaceholderData` interface:

```typescript
interface InlineButtonPlaceholderData {
  wekanCardId: string;
  buttonIndex: number;
  originalIconUrl: string; // Store original /cdn URL for lookup in iconReplacements map
  iconUrl: string; // Keep for backward compatibility/fallback
  linkUrl: string;
  linkText: string;
  textColor: string;
  backgroundColor: string;
}
```



#### 2. Update convertInlineButtonsToPlaceholders Function (lines 50-85)

Modify the icon URL extraction logic to:

- Extract and store the original `/cdn` URL
- Handle both cases: when HTML still has `/cdn` URL and when frontend already replaced it
- Store the original URL for later lookup in the map

**Current code (lines 51-61):**

```typescript
const iconUrlFromHtml = imgMatch?.[1] || '';

// Determine final icon URL: if it's a /cdn URL, look up replacement
// Otherwise, it's already been replaced by frontend, use as-is
let finalIconUrl = iconUrlFromHtml;

if (iconReplacements && iconUrlFromHtml.startsWith('/cdn')) {
  // Original /cdn URL - look up replacement
  finalIconUrl = iconReplacements[iconUrlFromHtml] || iconUrlFromHtml;
}
// If not /cdn, it's already a replacement URL from frontend, use it
```

**Replace with:**

```typescript
const iconUrlFromHtml = imgMatch?.[1] || '';

// Extract original /cdn URL for lookup in iconReplacements map
// The /cdn URL is only for reference - we'll look up the replacement URL when converting back
let originalIconUrl = '';
let finalIconUrl = '';

if (iconUrlFromHtml.startsWith('/cdn')) {
  // HTML still has original /cdn URL
  originalIconUrl = iconUrlFromHtml;
  // Look up replacement in map (the newly uploaded icon from MinIO)
  if (iconReplacements && iconReplacements[originalIconUrl]) {
    finalIconUrl = iconReplacements[originalIconUrl];
  } else {
    // No replacement found - will be empty (no broken image)
    finalIconUrl = '';
  }
} else {
  // HTML has replacement URL (frontend already replaced it)
  // Find the original /cdn URL by reverse lookup in the map
  if (iconReplacements) {
    const originalEntry = Object.entries(iconReplacements).find(([_, value]) => value === iconUrlFromHtml);
    if (originalEntry) {
      originalIconUrl = originalEntry[0]; // Original /cdn URL
      finalIconUrl = iconUrlFromHtml; // Use the replacement URL from HTML
    } else {
      // Not in map - might be a different URL, store as-is but no original to track
      originalIconUrl = '';
      finalIconUrl = iconUrlFromHtml;
    }
  } else {
    // No replacements map - use what's in HTML
    originalIconUrl = '';
    finalIconUrl = iconUrlFromHtml;
  }
}
```

**Update buttons.push (lines 77-85):**

```typescript
buttons.push({
  wekanCardId,
  buttonIndex,
  originalIconUrl: originalIconUrl, // Store original /cdn URL for lookup
  iconUrl: finalIconUrl, // Store replacement URL as fallback
  linkUrl: anchorMatch[1] || '',
  linkText: (anchorMatch[2]?.replace(/<[^>]*>/g, '') || 'Button').trim(),
  textColor: textColorMatch?.[1]?.trim() || '#579DFF',
  backgroundColor: bgColorMatch?.[1]?.trim() || '#1D2125',
});
```



#### 3. Update Placeholder Conversion Logic (lines 720-770)

Modify the code that converts placeholders back to inline buttons to:

- Use `iconReplacements` map to look up replacement URL using the original `/cdn` URL
- Always use the replacement URL from the map (the newly uploaded icon from MinIO)

**Current code (lines 746-758):**

```typescript
// Use decoded metadata if available, otherwise fall back to stored button data
const finalButtonData = buttonMetadata || {
  iconUrl: button.iconUrl,
  linkUrl: button.linkUrl,
  linkText: button.linkText,
  textColor: button.textColor,
  backgroundColor: button.backgroundColor,
  iconSize: 16,
};

// Always use replacement URL from stored button data as source of truth
// This ensures replaced icons are always used, even if placeholder metadata has original URL
finalButtonData.iconUrl = button.iconUrl; // Use replacement URL from stored data
```

**Replace with:**

```typescript
// Determine final icon URL using iconReplacements map as source of truth
// The replacement URL is the newly uploaded icon from MinIO
let finalIconUrl = '';

if (iconReplacements && button.originalIconUrl) {
  // Look up replacement URL using original /cdn URL from the map
  // This is the newly uploaded icon URL from MinIO
  finalIconUrl = iconReplacements[button.originalIconUrl] || '';
} else if (button.iconUrl && !button.iconUrl.startsWith('/cdn')) {
  // Fallback: if no original URL but iconUrl is already a replacement, use it
  finalIconUrl = button.iconUrl;
}
// If finalIconUrl is empty, button will render without icon (better than broken /cdn)

// Use decoded metadata if available, otherwise fall back to stored button data
const finalButtonData = buttonMetadata || {
  iconUrl: finalIconUrl,
  linkUrl: button.linkUrl,
  linkText: button.linkText,
  textColor: button.textColor,
  backgroundColor: button.backgroundColor,
  iconSize: 16,
};

// Always use replacement URL from iconReplacements map (the newly uploaded icon)
finalButtonData.iconUrl = finalIconUrl;
```



## Testing Considerations

After implementation, verify:

1. When icons are uploaded via the inline button dialog, the replacement URLs (MinIO URLs) are correctly stored and used