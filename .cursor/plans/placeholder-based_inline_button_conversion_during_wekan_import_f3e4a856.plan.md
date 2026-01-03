---
name: Placeholder-based inline button conversion during Wekan import
overview: Implement a backend-only placeholder system to convert Wekan inline button HTML to our markdown format during import. Replace HTML with placeholders during card creation, then batch update card descriptions after all cards are created.
todos:
  - id: add-placeholder-interface
    content: Add InlineButtonPlaceholderData interface to board-import.service.ts
    status: completed
  - id: create-placeholder-conversion-function
    content: Create convertInlineButtonsToPlaceholders function to detect and replace inline button HTML with placeholders
    status: completed
    dependencies:
      - add-placeholder-interface
  - id: modify-card-creation-placeholders
    content: Modify card creation loop to use placeholder conversion and store button data in Map
    status: completed
    dependencies:
      - create-placeholder-conversion-function
  - id: implement-batch-update
    content: Implement batch update logic after card creation to replace placeholders with inline button markdown
    status: completed
    dependencies:
      - modify-card-creation-placeholders
  - id: add-error-handling
    content: Add error handling with warnings logging that allows import to succeed silently
    status: completed
    dependencies:
      - implement-batch-update
---

# Placeholde

r-Based Inline Button Conversion for Wekan Import

## Problem

Wekan inline buttons (HTML with `<span style="display:inline-flex"><img><a>text</a></span>`) are not being converted to our `[INLINE_BUTTON:base64data]` format during import, causing them to render as hyperlinks with images instead of styled buttons.

## Solution Overview

1. During card creation: Detect inline button HTML and replace with placeholders
2. Store inline button data mapped to Wekan card IDs
3. After all cards are created: Batch update card descriptions to replace placeholders with actual inline button markdown
4. Error handling: Log warnings, show error toast to user, but silently succeed import

## Implementation Details

### 1. Create Placeholder Conversion Function

**File**: [`backend/src/services/board-import.service.ts`](backend/src/services/board-import.service.ts)Add a new interface and function before `processCardDescription`:

```typescript
interface InlineButtonPlaceholderData {
  wekanCardId: string;
  buttonIndex: number;
  iconUrl: string;
  linkUrl: string;
  linkText: string;
  textColor: string;
  backgroundColor: string;
}

function convertInlineButtonsToPlaceholders(
  description: string | null | undefined,
  wekanCardId: string
): { processedDescription: string | null; buttons: InlineButtonPlaceholderData[] } {
  if (!description) return { processedDescription: null, buttons: [] };
  
  const buttons: InlineButtonPlaceholderData[] = [];
  let buttonIndex = 0;
  
  // Regex to match Wekan inline button format (matches import code style)
  const wekanButtonRegex = /<span[^>]*style=["'][^"']*display:\s*inline-?flex[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;
  
  const processedDescription = description.replace(wekanButtonRegex, (match, innerHtml) => {
    // Extract components from inner HTML
    const imgMatch = innerHtml.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
    const anchorMatch = innerHtml.match(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const bgColorMatch = match.match(/background(?:-color)?\s*:\s*([^;"']+)/i);
    const textColorMatch = innerHtml.match(/(?:^|[^-])color\s*:\s*([^;"']+)/i) || match.match(/(?:^|[^-])color\s*:\s*([^;"']+)/i);
    
    if (anchorMatch) {
      buttons.push({
        wekanCardId,
        buttonIndex,
        iconUrl: imgMatch?.[1] || '',
        linkUrl: anchorMatch[1] || '',
        linkText: (anchorMatch[2]?.replace(/<[^>]*>/g, '') || 'Button').trim(),
        textColor: textColorMatch?.[1]?.trim() || '#579DFF',
        backgroundColor: bgColorMatch?.[1]?.trim() || '#1D2125',
      });
      
      const placeholder = `[INLINE_BUTTON_PLACEHOLDER:${wekanCardId}:${buttonIndex}]`;
      buttonIndex++;
      return placeholder;
    }
    
    return match; // Return original if no anchor found
  });
  
  return { processedDescription, buttons };
}
```



### 2. Modify Card Creation to Use Placeholders

**File**: [`backend/src/services/board-import.service.ts`](backend/src/services/board-import.service.ts)In the `importWekanBoard` method, around line 528-545:

1. Create a Map to store inline button data: `const inlineButtonData = new Map<string, InlineButtonPlaceholderData[]>();`
2. Modify the card description processing:

- Replace the `processCardDescription` call with placeholder conversion
- Store button data in the Map
- Use the placeholder-processed description in card inserts

3. Store button data keyed by `wekanCard._id` in the Map

### 3. Batch Update Card Descriptions After Creation

**File**: [`backend/src/services/board-import.service.ts`](backend/src/services/board-import.service.ts)After all cards are created (after line 601, before subtasks section):

1. Iterate through `inlineButtonData` Map
2. For each Wekan card ID, get the corresponding new card ID from `cardIdMap`
3. Fetch the card's current description
4. For each button, create `InlineButtonData` structure matching frontend interface
5. Base64 encode the button data: `Buffer.from(JSON.stringify(buttonData)).toString('base64')`
6. Replace placeholder with `[INLINE_BUTTON:${encodedData}]`
7. Update card description in batches (e.g., 50 at a time)
8. Wrap in try-catch: log errors as warnings, add to `result.warnings`, but don't fail import

### 4. Error Handling

- Wrap the entire batch update section in try-catch
- Log errors to console with context
- Add warning messages to `result.warnings` array
- Continue import even if placeholder conversion fails
- Frontend will display warnings in toast notifications

## Files to Modify

1. **[`backend/src/services/board-import.service.ts`](backend/src/services/board-import.service.ts)**:

- Add `InlineButtonPlaceholderData` interface (around line 125)
- Add `convertInlineButtonsToPlaceholders` function (around line 30, before `processCardDescription`)
- Modify card creation loop (around line 528-545) to use placeholders
- Add batch update logic after card creation (after line 601, before subtasks)

## Key Implementation Points

1. **Placeholder Format**: `[INLINE_BUTTON_PLACEHOLDER:wekanCardId:buttonIndex]`
2. **Button Data Structure**: Must match `InlineButtonData` interface from frontend:

- `id`: Generated as `wekan-btn-${cardId}-${buttonIndex}`
- `iconUrl`, `linkUrl`, `linkText`, `textColor`, `backgroundColor`
- `iconSize`: Default to 16
- `borderRadius`: Optional, defaults to 4 in frontend

3. **Base64 Encoding**: Use Node.js `Buffer.from(JSON.stringify(data)).toString('base64')`
4. **Batch Updates**: Process updates in batches of 50 to avoid overwhelming the database
5. **Error Handling**: Catch all errors, log as warnings, but don't fail the import

## Testing Considerations

- Test with Wekan exports containing inline buttons with various styles
- Test with buttons containing HTML entities in attributes
- Test with buttons that have single vs double quotes