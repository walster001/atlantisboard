---
name: Fix card attachment database insert
overview: Fix the card attachment upload failure by transforming snake_case field names to camelCase in the backend POST route before passing data to Prisma, since Prisma expects camelCase field names per the schema.
todos:
  - id: "1"
    content: Add snakeToCamel transformation utility function to backend/src/routes/db.ts
    status: pending
  - id: "2"
    content: Apply transformation in POST route before model.create() call to convert snake_case to camelCase
    status: pending
    dependencies:
      - "1"
  - id: "3"
    content: Verify transformation handles all CardAttachment fields correctly (card_id→cardId, file_name→fileName, etc.)
    status: pending
    dependencies:
      - "2"
  - id: "4"
    content: Test that card attachment uploads complete successfully and records are created in database
    status: pending
    dependencies:
      - "3"
---

# Fix

Card Attachment Database Insert Failure

## Problem Analysis

The backend log (lines 2667-2755) shows:

1. Storage upload succeeds ✅ (lines 2678-2683)
2. Database insert fails ❌ with error: `Argument 'fileName' is missing` (lines 2686-2755)

**Root Cause**: Field name mismatch between frontend and Prisma schema:

- Frontend sends: `card_id`, `file_name`, `file_url`, `file_size`, `file_type`, `uploaded_by` (snake_case)
- Prisma schema expects: `cardId`, `fileName`, `fileUrl`, `fileSize`, `fileType`, `uploadedBy` (camelCase)
- Backend route (`backend/src/routes/db.ts:221`) passes data directly to Prisma without transformation

The comment on line 219 says "data is already in camelCase" but the frontend code (`src/components/kanban/CardAttachmentSection.tsx:100-107`) clearly sends snake_case.

## Solution

Add a field name transformation utility in `backend/src/routes/db.ts` to convert snake_case to camelCase before passing data to Prisma in the POST route. This maintains backward compatibility with both naming conventions.

## Implementation Steps

### 1. Create transformation utility function

- Add `snakeToCamel()` function in `backend/src/routes/db.ts`
- Converts snake_case keys to camelCase (e.g., `file_name` → `fileName`)
- Recursively handles nested objects if needed

### 2. Apply transformation in POST route

- Modify `router.post('/:table')` in `backend/src/routes/db.ts` (line ~202)
- Transform incoming data before `model.create()` call (line ~221)
- Only transform for models that use `@map()` in Prisma schema (i.e., have snake_case DB columns)

### 3. Verify field mappings

- Check Prisma schema (`backend/prisma/schema.prisma:418-433`) to ensure correct mappings:
- `card_id` → `cardId`
- `file_name` → `fileName`
- `file_url` → `fileUrl`
- `file_size` → `fileSize`
- `file_type` → `fileType`
- `uploaded_by` → `uploadedBy`

### 4. Test compatibility

- Ensure transformation works for both snake_case (current frontend) and camelCase (if used elsewhere)
- Verify other tables aren't affected by the transformation

## Files to Modify

- `backend/src/routes/db.ts` - Add transformation function and apply in POST route

## Files to Verify (No Changes Expected)

- `backend/prisma/schema.prisma` - Verify CardAttachment model field mappings
- `src/components/kanban/CardAttachmentSection.tsx` - Verify it sends snake_case (correct behavior)