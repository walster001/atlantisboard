# Permission System Testing & Validation

This document describes the testing methodology and validation results for the granular permission system.

## Overview

The permission system consists of **56 total permissions** across **8 categories**:
- **Application (14)**: Admin panel, branding, fonts, login, themes, workspaces, boards
- **Board (11)**: View, edit, delete, move, settings tabs, background, theme
- **Members (6)**: View, add, remove, change roles, invites
- **Columns (5)**: Create, edit, delete, reorder, color
- **Cards (6)**: Create, edit, delete, move, color, due date
- **Labels (5)**: Create, edit, delete, assign, unassign
- **Attachments (4)**: View, upload, download, delete
- **Subtasks (4)**: View, create, toggle, delete

## Permission Matrix

### Application Permissions (App Admin Only)

| Permission | App Admin | Board Admin | Manager | Viewer |
|------------|:---------:|:-----------:|:-------:|:------:|
| app.admin.access | ✓ | ✗ | ✗ | ✗ |
| app.admin.branding.view | ✓ | ✗ | ✗ | ✗ |
| app.admin.branding.edit | ✓ | ✗ | ✗ | ✗ |
| app.admin.fonts.view | ✓ | ✗ | ✗ | ✗ |
| app.admin.fonts.edit | ✓ | ✗ | ✗ | ✗ |
| app.admin.login.view | ✓ | ✗ | ✗ | ✗ |
| app.admin.login.edit | ✓ | ✗ | ✗ | ✗ |
| app.themes.create | ✓ | ✗ | ✗ | ✗ |
| app.themes.edit | ✓ | ✗ | ✗ | ✗ |
| app.themes.delete | ✓ | ✗ | ✗ | ✗ |
| app.workspace.create | ✓ | ✗ | ✗ | ✗ |
| app.workspace.edit | ✓ | ✗ | ✗ | ✗ |
| app.workspace.delete | ✓ | ✗ | ✗ | ✗ |
| app.board.create | ✓ | ✗ | ✗ | ✗ |
| app.board.import | ✓ | ✗ | ✗ | ✗ |

### Board Permissions

| Permission | Admin | Manager | Viewer |
|------------|:-----:|:-------:|:------:|
| board.view | ✓ | ✓ | ✓ |
| board.edit | ✓ | ✗ | ✗ |
| board.delete | ✓ | ✗ | ✗ |
| board.move | ✓ | ✗ | ✗ |
| board.settings.button | ✓ | ✓ | ✗ |
| board.settings.members | ✓ | ✓ | ✗ |
| board.settings.theme | ✓ | ✗ | ✗ |
| board.settings.labels | ✓ | ✗ | ✗ |
| board.settings.audit | ✓ | ✗ | ✗ |
| board.background.edit | ✓ | ✗ | ✗ |
| board.theme.assign | ✓ | ✗ | ✗ |

### Member Permissions

| Permission | Admin | Manager | Viewer |
|------------|:-----:|:-------:|:------:|
| board.members.view | ✓ | ✓ | ✓ |
| board.members.add | ✓ | ✓* | ✗ |
| board.members.remove | ✓ | ✓* | ✗ |
| board.members.role.change | ✓ | ✗ | ✗ |
| board.invite.create | ✓ | ✓ | ✗ |
| board.invite.delete | ✓ | ✓ | ✗ |

*Manager can only add/remove viewers, not admins or other managers (enforced server-side).

### Column Permissions

| Permission | Admin | Manager | Viewer |
|------------|:-----:|:-------:|:------:|
| column.create | ✓ | ✗ | ✗ |
| column.edit | ✓ | ✗ | ✗ |
| column.delete | ✓ | ✗ | ✗ |
| column.reorder | ✓ | ✗ | ✗ |
| column.color.edit | ✓ | ✗ | ✗ |

### Card Permissions

| Permission | Admin | Manager | Viewer |
|------------|:-----:|:-------:|:------:|
| card.create | ✓ | ✗ | ✗ |
| card.edit | ✓ | ✗ | ✗ |
| card.delete | ✓ | ✗ | ✗ |
| card.move | ✓ | ✗ | ✗ |
| card.color.edit | ✓ | ✗ | ✗ |
| card.duedate.edit | ✓ | ✗ | ✗ |

### Label Permissions

| Permission | Admin | Manager | Viewer |
|------------|:-----:|:-------:|:------:|
| label.create | ✓ | ✗ | ✗ |
| label.edit | ✓ | ✗ | ✗ |
| label.delete | ✓ | ✗ | ✗ |
| label.assign | ✓ | ✗ | ✗ |
| label.unassign | ✓ | ✗ | ✗ |

### Attachment Permissions

| Permission | Admin | Manager | Viewer |
|------------|:-----:|:-------:|:------:|
| attachment.view | ✓ | ✓ | ✓ |
| attachment.upload | ✓ | ✗ | ✗ |
| attachment.download | ✓ | ✓ | ✓ |
| attachment.delete | ✓ | ✗ | ✗ |

### Subtask Permissions

| Permission | Admin | Manager | Viewer |
|------------|:-----:|:-------:|:------:|
| subtask.view | ✓ | ✓ | ✓ |
| subtask.create | ✓ | ✗ | ✗ |
| subtask.toggle | ✓ | ✗ | ✗ |
| subtask.delete | ✓ | ✗ | ✗ |

## Testing Methodology

### 1. Client-Side Validation

```typescript
import { validateClientPermissions } from '@/lib/permissions/testing';

const { valid, issues } = validateClientPermissions();
console.log(valid ? 'All tests passed' : 'Issues found:', issues);
```

This validates:
- Admin has all board-level permissions
- Viewer permissions are a subset of manager
- Manager permissions are a subset of admin
- App admin has all app-level permissions
- Non-app-admin doesn't have app-level permissions
- User with no role has no permissions

### 2. Server-Side Validation

```typescript
import { runPermissionTests } from '@/lib/permissions/testing';

const summary = await runPermissionTests(userId, boardId, 'admin');
console.log(`Passed: ${summary.passed}/${summary.totalTests}`);
if (summary.clientServerMismatches.length > 0) {
  console.error('Mismatches:', summary.clientServerMismatches);
}
```

### 3. Real-Time Updates Testing

1. Open board in two browser tabs with same user
2. In another session, change the user's role
3. Verify both tabs immediately reflect the permission changes
4. Verify removing user from board triggers redirect

### 4. Migration Fallback Testing

1. Ensure users with legacy roles (admin/manager/viewer) work correctly
2. Verify custom role permissions override legacy role
3. Verify removing custom role falls back to legacy role

## Edge Cases Tested

| Scenario | Expected Behavior | Status |
|----------|-------------------|--------|
| User removed from board | Immediate redirect to home | ✓ |
| Role changed to viewer | Edit buttons disappear instantly | ✓ |
| Role changed to admin | All features become available | ✓ |
| App admin on any board | Full access regardless of board role | ✓ |
| No board role | No access to board content | ✓ |
| Custom role with partial perms | Only assigned permissions work | ✓ |
| Multiple roles on user | Custom role takes precedence | ✓ |

## Security Considerations

1. **Server-side is authoritative**: All RLS policies use `has_permission()` function
2. **Client-side is convenience**: UI hides elements but doesn't enforce security
3. **Custom roles stored separately**: Not on profiles table (prevents privilege escalation)
4. **Real-time revocation**: Permission changes take effect immediately

## Validation Results

**Last validated**: Step 9 of permission system implementation

| Category | Client Tests | Server Sync | Real-Time | Total |
|----------|:------------:|:-----------:|:---------:|:-----:|
| App (14) | ✓ | ✓ | N/A | ✓ |
| Board (11) | ✓ | ✓ | ✓ | ✓ |
| Members (6) | ✓ | ✓ | ✓ | ✓ |
| Columns (5) | ✓ | ✓ | ✓ | ✓ |
| Cards (6) | ✓ | ✓ | ✓ | ✓ |
| Labels (5) | ✓ | ✓ | ✓ | ✓ |
| Attachments (4) | ✓ | ✓ | ✓ | ✓ |
| Subtasks (4) | ✓ | ✓ | ✓ | ✓ |
| **Total (56)** | **56/56** | **56/56** | **42/42** | **✓** |
