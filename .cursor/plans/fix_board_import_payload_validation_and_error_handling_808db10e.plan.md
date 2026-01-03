---
name: Fix Board Import Payload Validation and Error Handling
overview: Fix the board import to accept additional payload fields gracefully, make the Zod schema permissive, ensure the backend service handles modified Wekan data robustly, and improve error messages. The import should work with or without inline button icon replacements.
todos: []
---

# Fix Board Import

Payload Validation and Error Handling

## Problem Analysis

1. **Zod Schema Strictness**: The current `importBoardSchema` uses `z.object()` which is strict and rejects unknown fields

2. **Modified Wekan Data**: After icon replacement, `wekanData` structure may have unexpected properties

3. **Error Handling**: Backend may not handle validation errors gracefully

4. **Streaming Support**: SSE streaming is still used and should continue working

## Root Causes

- Zod schema rejects any extra fields in request body

- Backend service may not handle all variations in Wekan data structure

- Error messages may not be user-friendly when validation fails

- No explicit handling for edge cases in modified Wekan data

## Implementation Plan

### 1. Make Zod Schema Permissive (`backend/src/routes/board-import.ts`)

**Change:**

```typescript
const importBoardSchema = z.object({
  wekanData: z.any(),
  defaultCardColor: z.string().nullable().optional(),
}).passthrough(); // Allow extra fields without throwing
```



**Or use `.strip()` to silently ignore extra fields:**

```typescript
const importBoardSchema = z.object({
  wekanData: z.any(),
  defaultCardColor: z.string().nullable().optional(),
}).strip(); // Silently remove extra fields
```



**Recommendation**: Use `.passthrough()` to allow future extensibility while ignoring unknown fields.

### 2. Add Robust Error Handling in Backend Route

**Enhance error handling:**

- Catch Zod validation errors specifically

- Provide user-friendly error messages

- Log detailed errors for debugging

- Ensure SSE stream is properly closed on errors

### 3. Make Backend Service More Robust (`backend/src/services/board-import.service.ts`)

**Add defensive checks:**

- Validate `wekanData` structure before processing

- Handle cases where boards/cards/lists might be missing or malformed

- Gracefully skip invalid data with warnings instead of errors

- Ensure card descriptions with replaced URLs are handled correctly

### 4. Verify Frontend Payload (`src/components/import/BoardImportDialog.tsx`)

**Ensure:**

- Only `wekanData` and `defaultCardColor` are sent (already correct)

- Modified `wekanData` from icon replacement maintains valid structure

- Error handling displays user-friendly messages

### 5. Add Validation Helpers

**Create helper functions:**

- Validate Wekan board structure

- Check for required fields

- Normalize data structure (handle both array and single board)

## Implementation Steps

1. **Update Zod schema** to use `.passthrough()` or `.strip()`

2. **Enhance error handling** in route handler with specific Zod error catching

3. **Add data validation** in service before processing

4. **Add defensive checks** throughout service for missing/malformed data

5. **Test with:**

- Normal Wekan export

- Wekan export with inline buttons (replaced)

- Wekan export with inline buttons (skipped)

- Malformed data (should warn, not error)

## Files to Modify

- `backend/src/routes/board-import.ts` - Make schema permissive, improve error handling

- `backend/src/services/board-import.service.ts` - Add validation and defensive checks

## Files to Verify (No Changes Expected)

- `src/components/import/BoardImportDialog.tsx` - Verify payload structure

- `src/components/import/InlineButtonIconDialog.tsx` - Verify data modification

## Success Criteria

- ✅ Import succeeds with or without inline button icon replacements

- ✅ No 500 errors from payload validation

- ✅ Extra fields in request are ignored gracefully

- ✅ Modified Wekan data (after icon replacement) is processed correctly