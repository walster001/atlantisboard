---
name: Fix Board Import Metadata Colors and Icon Replacement
overview: "Fix four issues in board imports: (1) Import result metadata shows \"undefined\" because backend returns snake_case but frontend expects camelCase, (2) Label colors not importing correctly, (3) Card colors not importing correctly, (4) Inline button icon replacement doesn't delete old files from MinIO."
todos:
  - id: fix-metadata-mapping
    content: "Fix import result metadata mapping: Transform snake_case (boards_created, cards_created) to camelCase (boardsCreated, cardsCreated) in importWekanWithStreaming function"
    status: completed
  - id: fix-label-colors-wekan
    content: "Fix Wekan label color import: Ensure getWekanColor() always returns valid hex, handle null/undefined/empty strings, add fallbacks"
    status: completed
  - id: fix-label-colors-trello
    content: "Fix Trello label color import: Ensure getTrelloColor() always returns valid hex, handle null/undefined/empty strings, add fallbacks"
    status: completed
  - id: fix-card-colors-wekan
    content: "Fix Wekan card color import: Ensure card color is valid hex or null (never undefined) before database insert"
    status: completed
  - id: fix-card-colors-trello
    content: "Fix Trello card color import: Improve color extraction from card.cover, ensure final color is valid hex or null"
    status: completed
  - id: fix-icon-replacement
    content: "Fix inline button icon replacement: Store file path when uploading, use stored path for deletion instead of extracting from URL"
    status: completed
---

# Fix Board Import Metadata, Colors, and Icon Replacement

## Context

### Current Issues

1. **Import toast shows "undefined boards with undefined cards"** - Backend returns `boards_created`/`cards_created` (snake_case) but frontend expects `boardsCreated`/`cardsCreated` (camelCase)
2. **Label colors not importing correctly** - Color mapping may have edge cases
3. **Card colors not importing correctly** - Color mapping may have edge cases  
4. **Inline button icon replacement doesn't delete old files** - Old icons remain orphaned in MinIO `import-icons` bucket

### Architecture

- **Backend**: `backend/src/services/board-import.service.ts` returns `ImportResult` with snake_case fields
- **Backend Route**: `backend/src/routes/board-import.ts` sends SSE with snake_case fields
- **Frontend**: `src/components/import/BoardImportDialog.tsx` expects camelCase `ImportResult` interface
- **Storage**: `src/lib/storage.ts` handles MinIO operations via backend API
- **Icon Replacement**: `src/components/import/InlineButtonIconDialog.tsx` uploads to `import-icons/` subdirectory in `branding` bucket

### Database Schema

- **Labels**: `color` field is `String` (required, hex format)
- **Cards**: `color` field is `String?` (nullable, hex format)

## Implementation Plan

### 1. Fix Import Result Metadata Mapping

**File**: `src/components/import/BoardImportDialog.tsx`**Problem**: Backend SSE returns `{ boards_created: 1, cards_created: 5 }` but frontend `ImportResult` interface expects `{ boardsCreated: 1, cardsCreated: 5 }`. The type cast `data as ImportResult` doesn't transform the fields.**Solution**: Transform snake_case to camelCase when receiving SSE result:

- In `importWekanWithStreaming` function around line 497, when `data.type === 'result'`, transform the result before resolving:
  ```typescript
      const transformedResult: ImportResult = {
        success: data.success,
        workspacesCreated: data.workspaces_created ?? 0,
        boardsCreated: data.boards_created ?? 0,
        columnsCreated: data.columns_created ?? 0,
        cardsCreated: data.cards_created ?? 0,
        labelsCreated: data.labels_created ?? 0,
        subtasksCreated: data.subtasks_created ?? 0,
        errors: data.errors ?? [],
        warnings: data.warnings ?? [],
      };
      resolve(transformedResult);
  ```




### 2. Fix Label Color Import

**Files**:

- `backend/src/services/board-import.service.ts` (Wekan)
- `src/components/import/BoardImportDialog.tsx` (Trello)

**Problem**: Color mapping functions may not handle all edge cases (null, undefined, empty strings, invalid colors).**Solution**:

- **Wekan**: In `getWekanColor()` function (line 60), ensure it always returns a valid hex color:
- If color is null/undefined/empty, return default
- If already hex (starts with #), validate and return
- If named color, map to hex
- Add fallback to `#6b7280` (gray) for unmapped colors
- **Trello**: In `getTrelloColor()` function (line 229), apply same validation:
- Ensure null/undefined returns default
- Validate hex format
- Map named colors
- Add fallback

**Specific fixes**:

- Wekan: Line 371 - ensure `getWekanColor(wekanLabel.color)` never returns null/undefined
- Trello: Line 619 - ensure `getTrelloColor(label.color)` never returns null/undefined

### 3. Fix Card Color Import

**Files**:

- `backend/src/services/board-import.service.ts` (Wekan, line 476)
- `src/components/import/BoardImportDialog.tsx` (Trello, line 722-742)

**Problem**: Card color logic may not properly handle all color formats or fallbacks.**Solution**:

- **Wekan**: Line 476 - ensure `getWekanColor(wekanCard.color)` returns valid hex or null (not undefined)
- **Trello**: Lines 722-742 - improve color extraction from `card.cover.color`:
- Handle null/undefined cover
- Validate all color formats (hex, named, rgb)
- Ensure final color is either valid hex string or null (not undefined)
- Both: Ensure `finalCardColor` is `string | null` (never undefined) before database insert

### 4. Fix Inline Button Icon Replacement

**File**: `src/components/import/InlineButtonIconDialog.tsx`**Problem**: When "Change icon" is clicked (line 157-233), the code tries to delete the old file but:

- It extracts path from `button.replacementUrl` using `extractStoragePathFromUrl(button.replacementUrl, 'branding')`
- The path should be `import-icons/${fileName}` but extraction might fail
- Even if extraction works, deletion might not target the correct bucket/path

**Solution**:

- Store the original file path when uploading (line 201: `const filePath = `import-icons/${fileName}`)
- Store this path in button state alongside `replacementUrl`
- When replacing, use the stored path directly instead of extracting from URL
- Ensure deletion uses the correct bucket ('branding') and full path (`import-icons/${oldFileName}`)

**Implementation**:

- Add `replacementPath?: string` to `DetectedInlineButton` interface (line 11)
- Store path when uploading (line 201): `replacementPath: filePath`
- When replacing (line 178), check for `button.replacementPath` first, fallback to URL extraction
- Use stored path for deletion: `deleteFile('branding', button.replacementPath)`

## Testing Checklist

- [ ] Import toast shows correct board and card counts (not "undefined")
- [ ] Labels import with correct colors from both Trello and Wekan
- [ ] Cards import with correct colors from both Trello and Wekan
- [ ] Replacing inline button icon deletes old file from MinIO
- [ ] No orphaned files remain in `import-icons` bucket after replacement
- [ ] Trello imports still work correctly
- [ ] Wekan imports still work correctly

## Files to Modify

1. `src/components/import/BoardImportDialog.tsx` - Fix metadata mapping and Trello color handling
2. `backend/src/services/board-import.service.ts` - Fix Wekan color handling
3. `src/components/import/InlineButtonIconDialog.tsx` - Fix icon replacement deletion

## Notes

- Do NOT modify board rendering UI, card UI, label UI, or realtime subscriptions
- Maintain existing API contracts