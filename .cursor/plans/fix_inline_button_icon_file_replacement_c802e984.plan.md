---
name: Fix inline button icon file replacement and MinIO URL path extraction
overview: Fix the "Change Icon" button in InlineButtonIconDialog to delete the previously uploaded file before uploading a new one, and refactor all components to use correct MinIO/S3 URL path extraction logic.
todos: []
---

# Fix inline button icon file replacement and MinIO URL path extraction

## Problem

1. When clicking "Change Icon" in the inline button importer dialog, the code uploads a new file without deleting the previous one. Each upload creates a new file with a timestamp-based name, causing old files to accumulate in storage.
2. The current path extraction logic in multiple components uses `split('/branding/')` which doesn't work correctly with MinIO/S3 URLs. MinIO URLs use the format `${S3_ENDPOINT}/${bucketPrefix}-${bucket}/${path}` (e.g., `http://localhost:9000/atlantisboard-branding/import-icons/file.png`), so splitting on `/branding/` fails because the bucket name includes the prefix (`atlantisboard-branding`).

## Solution

1. Create a helper function in `src/lib/storage.ts` to extract storage paths from URLs that works with both MinIO/S3 format and API proxy format.
2. Update all affected components to use this helper function instead of inline string splitting.
3. Add file deletion logic to `InlineButtonIconDialog` before uploading replacement icons.

## Implementation Details

### Step 1: Create path extraction helper function

**File: `src/lib/storage.ts`**Add a new exported function `extractStoragePathFromUrl`:

```typescript
/**
    * Extract storage path from a storage URL
    * Handles both MinIO/S3 format and API proxy format
    * 
    * MinIO format: http://localhost:9000/atlantisboard-branding/path/to/file.png
    * API proxy format: /api/storage/branding/path/to/file.png
    * 
    * @param url - The storage URL
    * @param bucket - The bucket name (e.g., 'branding', 'fonts', 'card-attachments')
    * @returns The storage path, or null if extraction fails
 */
export function extractStoragePathFromUrl(url: string, bucket: string): string | null {
  if (!url) return null;
  
  // Try MinIO/S3 format first: ${prefix}-${bucket}/path
  // Look for pattern like "-branding/" or "-fonts/" etc.
  const minioPattern = `-${bucket}/`;
  const minioIndex = url.indexOf(minioPattern);
  if (minioIndex !== -1) {
    const path = url.substring(minioIndex + minioPattern.length);
    return path || null;
  }
  
  // Fall back to API proxy format: /api/storage/${bucket}/path
  const apiPattern = `/api/storage/${bucket}/`;
  const apiIndex = url.indexOf(apiPattern);
  if (apiIndex !== -1) {
    const path = url.substring(apiIndex + apiPattern.length);
    // Decode URI component in case it was encoded
    try {
      return decodeURIComponent(path) || null;
    } catch {
      return path || null;
    }
  }
  
  return null;
}
```



### Step 2: Update AppBrandingSettings.tsx

**File: `src/components/admin/AppBrandingSettings.tsx`**

1. **Import the helper function** (update line 4):

                                                - Change `import { uploadFile, deleteFile } from '@/lib/storage';`
                                                - To `import { uploadFile, deleteFile, extractStoragePathFromUrl } from '@/lib/storage';`

2. **Update `handleLogoUpload` function** (line ~148):

                                                - Replace: `const oldPath = currentUrl.split('/branding/')[1];`
                                                - With: `const oldPath = extractStoragePathFromUrl(currentUrl, 'branding');`
                                                - Remove the `if (oldPath)` check since the function returns null if extraction fails

3. **Update `handleRemoveLogo` function** (line ~189):

                                                - Replace: `const path = currentUrl.split('/branding/')[1];`
                                                - With: `const path = extractStoragePathFromUrl(currentUrl, 'branding');`
                                                - Add null check: `if (!path) return;` after extraction

### Step 3: Update BrandingSettings.tsx

**File: `src/components/admin/BrandingSettings.tsx`**

1. **Import the helper function** (find the storage import, likely around line 4-10):

                                                - Add `extractStoragePathFromUrl` to the import from `@/lib/storage`

2. **Update login logo upload/delete functions** (lines ~265, ~302):

                                                - Replace all instances of: `settings.customLoginLogoUrl.split('/branding/')[1]`
                                                - With: `extractStoragePathFromUrl(settings.customLoginLogoUrl, 'branding')`
                                                - Update error handling to check for null

3. **Update background image upload/delete functions** (lines ~337, ~374):

                                                - Replace all instances of: `settings.customLoginBackgroundImageUrl.split('/branding/')[1]`
                                                - With: `extractStoragePathFromUrl(settings.customLoginBackgroundImageUrl, 'branding')`
                                                - Update error handling to check for null

### Step 4: Update CustomFontsSettings.tsx

**File: `src/components/admin/CustomFontsSettings.tsx`**

1. **Import the helper function**:

                                                - Add `extractStoragePathFromUrl` to the import from `@/lib/storage`

2. **Update `handleDeleteFont` function** (line ~120):

                                                - Replace: `const fileName = font.fontUrl.split('/fonts/')[1];`
                                                - With: `const fileName = extractStoragePathFromUrl(font.fontUrl, 'fonts');`
                                                - Update error handling to check for null

### Step 5: Update CardAttachmentSection.tsx

**File: `src/components/kanban/CardAttachmentSection.tsx`**

1. **Import the helper function**:

                                                - Add `extractStoragePathFromUrl` to the import from `@/lib/storage`

2. **Update `handleDelete` function** (line ~137):

                                                - Replace the split logic with:
     ```typescript
                    const storagePath = extractStoragePathFromUrl(attachment.file_url, 'card-attachments');
                    if (!storagePath) {
                      console.error('Failed to extract storage path from URL');
                      // Continue with database deletion even if storage path extraction fails
                    } else {
                      const deleteResult = await deleteFile('card-attachments', storagePath);
                      if (deleteResult.error) {
                        console.error('Failed to delete attachment file:', deleteResult.error);
                      }
                    }
     ```




### Step 6: Update InlineButtonIconDialog.tsx

**File: `src/components/import/InlineButtonIconDialog.tsx`**

1. **Import functions** (update line 7):

                                                - Change `import { uploadFile } from '@/lib/storage';`
                                                - To `import { uploadFile, deleteFile, extractStoragePathFromUrl } from '@/lib/storage';`

2. **Modify `handleFileSelect` function** (lines 157-215):

                                                - After validation (after line ~175), before `setUploading(buttonId)` (line ~177), add:
     ```typescript
                    // Check if a previous upload exists and delete it
                    const button = buttons.find(b => b.id === buttonId);
                    if (button?.replacementUrl) {
                      const oldPath = extractStoragePathFromUrl(button.replacementUrl, 'branding');
                      if (oldPath) {
                        try {
                          const deleteResult = await deleteFile('branding', oldPath);
                          if (deleteResult.error) {
                            console.error('Failed to delete old icon file:', deleteResult.error);
                            // Continue with upload even if deletion fails
                          }
                        } catch (error) {
                          console.error('Error deleting old icon file:', error);
                          // Continue with upload even if deletion fails
                        }
                      }
                    }
     ```




## URL Format Reference

### MinIO/S3 Format (when S3_ENDPOINT is configured)

- Format: `${S3_ENDPOINT}/${bucketPrefix}-${bucket}/${path}`
- Example: `http://localhost:9000/atlantisboard-branding/import-icons/inline-icon-1234567890.png`
- Bucket name includes prefix: `atlantisboard-branding`

### API Proxy Format (when S3_ENDPOINT is not configured)

- Format: `/api/storage/${bucket}/${path}`
- Example: `/api/storage/branding/import-icons/inline-icon-1234567890.png`

## Error Handling

- If path extraction fails (returns null), log an error but continue with the operation (don't block the user)
- If file deletion fails, log the error but continue with upload/replacement (don't block the user)
- The helper function returns null if extraction fails, allowing callers to handle gracefully

## Notes

- This refactoring standardizes path extraction across all components
- The helper function handles both URL formats for backward compatibility
- All components now use consistent path extraction logic
- Files are stored in the `branding` bucket with path `import-icons/${fileName}` for inline button icons
- The same pattern applies to other buckets: `fonts`, `card-attachments`

## Testing Considerations

- Test with MinIO URLs (format with prefix)
- Test with API proxy URLs (format without prefix)