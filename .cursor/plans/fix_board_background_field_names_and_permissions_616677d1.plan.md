---
name: Fix Board Background Field Names and Permissions
overview: Fix snake_case field name mismatches causing 500 errors, update validators to use camelCase, and correct permission checks for board background uploads to allow board admins (not just app admins).
todos: []
---

# Fix Board Background Field Names and Permissions

## Problem Summary

1. **Field Name Mismatch**: Frontend sends `background_color` (snake_case) but Prisma expects `backgroundColor` (camelCase), causing 500 errors
2. **Validator Schema**: Uses snake_case instead of camelCase
3. **Permission Issue**: Board background uploads require app admin permission instead of board-level permission

## Implementation Plan

### 1. Fix Field Names in BoardBackgroundSettings.tsx

**File**: `src/components/kanban/BoardBackgroundSettings.tsx`Change all 4 instances of `background_color` to `backgroundColor`:

- **Line 86**: In `handleSaveColor()` function
  ```typescript
        // Change from:
        background_color: backgroundColor,
        // To:
        backgroundColor: backgroundColor,
  ```




- **Line 114**: In `handleFollowTheme()` function
  ```typescript
        // Change from:
        background_color: themeColor,
        // To:
        backgroundColor: themeColor,
  ```




- **Line 168**: In `handleFileUpload()` function
  ```typescript
        // Change from:
        background_color: publicUrl,
        // To:
        backgroundColor: publicUrl,
  ```




- **Line 196**: In `handleRemoveImage()` function
  ```typescript
        // Change from:
        background_color: defaultColor,
        // To:
        backgroundColor: defaultColor,
  ```




### 2. Fix Validator Schema

**File**: `src/lib/validators.ts`Update `boardSchema` to use camelCase:

```typescript
export const boardSchema = z.object({
  name: z.string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters'),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format'),
});
```



### 3. Fix Home.tsx Validation Calls

**File**: `src/pages/Home.tsx`Update validation calls to use `backgroundColor`:

- **Line 801**: In `createBoard()` function
  ```typescript
        // Change from:
        const validated = boardSchema.parse({
          name: newBoardName,
          background_color: selectedTheme.navbarColor,
        });
        // To:
        const validated = boardSchema.parse({
          name: newBoardName,
          backgroundColor: selectedTheme.navbarColor,
        });
  ```




- **Line 862**: In `renameBoard()` function
  ```typescript
        // Change from:
        const validated = boardSchema.parse({ name: editBoardName, background_color: '#0079bf' });
        // To:
        const validated = boardSchema.parse({ name: editBoardName, backgroundColor: '#0079bf' });
  ```




### 4. Fix Permission Check in Storage Route

**File**: `backend/src/routes/storage.ts`Update the permission check for branding bucket uploads to handle board backgrounds separately:**Location**: Around line 145-153Add logic to:

1. Detect if path is a board background (`board-backgrounds/` prefix)
2. Extract boardId from filename (format: `${boardId}-bg-${timestamp}.${ext}`)
3. Check board-level permission `board.background.edit` instead of app admin permission
```typescript
// Replace the existing branding permission check (lines 145-153) with:
} else if (bucket === 'branding' || bucket === 'fonts') {
  // Check if this is a board background upload
  if (bucket === 'branding' && path.startsWith('board-backgrounds/')) {
    // Extract boardId from filename: board-backgrounds/${boardId}-bg-${timestamp}.${ext}
    const filename = path.split('/').pop() || '';
    const boardIdMatch = filename.match(/^([^-]+)-bg-/);
    
    if (boardIdMatch && boardIdMatch[1]) {
      const boardId = boardIdMatch[1];
      // Check board-level permission
      const context = permissionService.buildContext(
        authReq.userId!,
        authReq.user?.isAdmin ?? false,
        boardId
      );
      await permissionService.requirePermission('board.background.edit', context);
    } else {
      // Invalid board background path format, require app admin
      const context = permissionService.buildContext(authReq.userId!, authReq.user?.isAdmin ?? false);
      await permissionService.requirePermission('app.admin.branding.edit', context);
    }
  } else {
    // Admin-only for other branding and fonts
    const context = permissionService.buildContext(authReq.userId!, authReq.user?.isAdmin ?? false);
    if (bucket === 'branding') {
      await permissionService.requirePermission('app.admin.branding.edit', context);
    } else if (bucket === 'fonts') {
      await permissionService.requirePermission('app.admin.fonts.edit', context);
    }
  }
}
```




## Testing Checklist

- [ ] Upload board background image as board admin (should succeed)
- [ ] Upload board background image as board viewer (should fail with permission error)
- [ ] Set board background color (should succeed)
- [ ] Remove board background image (should succeed)
- [ ] Create new board with background color (should succeed)
- [ ] Rename board (should succeed)
- [ ] Verify no 500 errors in console
- [ ] Verify UI updates correctly after successful operations

## Notes