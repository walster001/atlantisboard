---
name: Fix File Upload Minio Migration
overview: Fix all remaining Supabase storage dependencies and ensure correct Minio bucket configuration for file uploads. Replace remaining `supabase` references with `api`, fix backend upload response format, ensure correct bucket naming, and verify all upload flows work correctly.
todos: []
---

# Fix File Upload Internal Server Errors - Minio Migration

## Overview

Fix all remaining Supabase storage dependencies and ensure correct Minio bucket configuration for file uploads. The backend already uses Minio via S3-compatible storage service, but there are remaining Supabase references in frontend code and potential issues with URL construction and bucket naming.

## Issues Identified

1. **Remaining Supabase References**: `BoardBackgroundSettings.tsx` has 3 `supabase` references that need to be replaced with `api`
2. **Upload Response Format**: Backend returns `url` and `publicUrl`, but frontend expects `path` and `fullPath`
3. **Public URL Construction**: Frontend makes separate API call for `getPublicUrl`, but upload response already includes it
4. **Bucket Naming**: Backend uses prefix `atlantisboard-{bucket}` - need to verify Minio buckets are created correctly
5. **Error Handling**: Need to ensure proper error messages for storage configuration issues

## Implementation Plan

### 1. Fix Remaining Supabase References

**File**: `src/components/kanban/BoardBackgroundSettings.tsx`

- Replace `supabase` with `api` on lines 81, 109, and 195
- Ensure all database operations use `api.from()` instead of `supabase.from()`

### 2. Fix Backend Upload Response Format

**File**: `backend/src/routes/storage.ts`

- Update upload endpoint to return response matching frontend expectations
- Include `publicUrl` in response (already present, but ensure format is correct)
- Ensure response structure: `{ path, url, publicUrl }`

### 3. Optimize Frontend Storage Client

**File**: `src/integrations/api/client.ts`

- Update `upload` method to use `publicUrl` from upload response instead of making separate `getPublicUrl` call
- Keep `getPublicUrl` method for cases where URL is needed without upload
- Ensure error handling properly extracts error messages from backend responses

### 4. Fix Public URL Construction

**File**: `backend/src/services/storage.service.ts`

- Verify `getPublicUrl` method constructs URLs correctly for Minio
- Ensure URL format matches Minio endpoint structure: `{endpoint}/{bucket-prefix}-{bucket}/{path}`
- Handle cases where `S3_ENDPOINT` might not be configured

### 5. Update Components to Use Optimized Upload

**Files to update**:

- `src/components/kanban/CardAttachmentSection.tsx` - Use `publicUrl` from upload response
- `src/components/kanban/InlineButtonEditor.tsx` - Use `publicUrl` from upload response  
- `src/components/import/InlineButtonIconDialog.tsx` - Use `publicUrl` from upload response
- `src/components/kanban/BoardBackgroundSettings.tsx` - Use `publicUrl` from upload response
- `src/components/admin/BrandingSettings.tsx` - Use `publicUrl` from upload response
- `src/components/admin/CustomFontsSettings.tsx` - Use `publicUrl` from upload response

### 6. Verify Bucket Configuration

**File**: `backend/src/services/storage.service.ts`

- Ensure bucket naming uses prefix: `atlantisboard-branding`, `atlantisboard-fonts`, `atlantisboard-card-attachments`
- Add validation to check if storage is configured before operations
- Improve error messages when storage is not configured

### 7. Error Handling Improvements

**Files**:

- `backend/src/routes/storage.ts` - Add better error messages for missing storage configuration
- `backend/src/services/storage.service.ts` - Improve error messages for S3/Minio errors
- Frontend components - Ensure error messages are user-friendly

## Bucket Mapping

- `branding` → Minio bucket: `atlantisboard-branding` (public)
- Used for: logos, board backgrounds, inline button icons
- `fonts` → Minio bucket: `atlantisboard-fonts` (public)
- Used for: custom font files
- `card-attachments` → Minio bucket: `atlantisboard-card-attachments` (private)
- Used for: card file attachments

## Testing Checklist

- [ ] Card attachment uploads work
- [ ] Board background image uploads work
- [ ] Inline button icon uploads work (both editor and import dialog)
- [ ] Custom font uploads work
- [ ] Branding logo uploads work
- [ ] File deletions work
- [ ] Public URLs are accessible for public buckets
- [ ] Private file downloads require authentication
- [ ] Error messages are clear when storage is not configured
- [ ] Error messages are clear for invalid file types/sizes

## Files to Modify

1. `src/components/kanban/BoardBackgroundSettings.tsx` - Fix supabase references
2. `backend/src/routes/storage.ts` - Ensure response format matches frontend
3. `src/integrations/api/client.ts` - Optimize upload to use response publicUrl
4. `backend/src/services/storage.service.ts` - Improve error handling and URL construction
5. `src/components/kanban/CardAttachmentSection.tsx` - Use upload response publicUrl
6. `src/components/kanban/InlineButtonEditor.tsx` - Use upload response publicUrl
7. `src/components/import/InlineButtonIconDialog.tsx` - Use upload response publicUrl
8. `src/components/kanban/BoardBackgroundSettings.tsx` - Use upload response publicUrl
9. `src/components/admin/BrandingSettings.tsx` - Use upload response publicUrl