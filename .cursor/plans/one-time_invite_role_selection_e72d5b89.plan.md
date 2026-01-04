---
name: One-Time Invite Role Selection
overview: Add role selection for one-time invite links, allowing users to choose default roles (admin, manager, viewer) or custom roles when generating invites. Recurring links remain unchanged.
todos: []
---

# One-Time Invite Links

with Role Selection

## Overview

Allow users to specify a role (default or custom) when generating one-time invite links. Recipients will be added to the board with the specified role when they redeem the invite. Recurring links remain unchanged (always viewer).

## Implementation Steps

### 1. Database Schema Changes

**File:** `backend/prisma/schema.prisma`

- Add `role` field (optional `BoardRole`) to `BoardInviteToken` model
- Add `customRoleId` field (optional UUID) to `BoardInviteToken` model  
- Add relation to `CustomRole` model
- Create and run migration

**Migration considerations:**

- Existing tokens will have `NULL` for both fields (backward compatible)
- Default behavior: NULL = viewer role (current behavior)

### 2. Backend: Invite Generation Endpoint

**File:** `backend/src/routes/boards.ts`**Changes:**

- Update `generateInviteSchema` to accept optional `role` and `customRoleId` fields
- Add validation: for one-time links, accept `role` OR `customRoleId` (not both)
- For recurring links, reject `role` and `customRoleId` (must be viewer)
- Validate custom role exists in database
- Validate requester has permission to assign the selected role (admin role requires admin permissions)
- Store role/customRoleId in database when creating token
- Include role info in response

**Permission validation logic:**

- Check if requester has `board.members.role.change` permission
- For admin role: enforce that requester is admin or app admin (similar to `memberService.updateBoardMemberRole`)
- For manager role: check permission level, should not be able to create invite link to higher role than itself. 
- For custom roles: validate role exists and has board.members.role.change permission set. 

### 3. Backend: Invite Redemption Endpoint

**File:** `backend/src/routes/invites.ts`**Changes:**

- When redeeming, check if `inviteToken.role` or `inviteToken.customRoleId` is set
- Use stored role instead of hardcoded 'viewer'
- If `customRoleId` is set:
- Create `BoardMember` with appropriate default role (viewer if not specified)
- Create `BoardMemberCustomRole` record linking user to custom role
- Update audit log to record the actual role assigned
- Update custom event payload to include role information

**Note:** The default role field in `BoardMember` must still be set even when using custom roles (required by schema).

### 4. Backend: Custom Roles API Endpoint

**File:** `backend/src/routes/boards.ts` (or create new route file)**New endpoint:** `GET /api/boards/:boardId/custom-roles`**Functionality:**

- Check user has `board.invite.create` permission
- Fetch all non-system custom roles from database
- Return list with id, name, description
- Used by frontend to populate custom role dropdown

**Alternative:** Use existing `/db/custom_roles` endpoint if it's accessible and filters system roles properly.

### 5. Frontend: InviteLinkButton Component

**File:** `src/components/kanban/InviteLinkButton.tsx`**Changes:**

- Add state: `selectedRole`, `selectedCustomRoleId`, `customRoles`
- Fetch custom roles when dialog opens (only if one-time link selected)
- Add role selection UI (only visible when `linkType === 'one_time'`):
- Select dropdown for default roles: Viewer (default), Manager, Admin
- If custom roles exist, add "Custom Role" option
- If "Custom Role" selected, show second dropdown with custom roles
- Update `generateInviteLink` to send `role` or `customRoleId` in request body
- Update success message to show which role was assigned
- Reset role selection when dialog closes or link type changes

**UI Layout:**

- Place role selection between "Link Type" and "Generate Invite Link" button
- Use shadcn Select components for dropdowns
- Add helper text explaining the role selection

### 6. Frontend: InvitePage Component (Optional Enhancement)

**File:** `src/pages/InvitePage.tsx`**Changes:**

- Update success toast message to show assigned role instead of hardcoded "viewer"
- This requires backend to return role info in redemption response

### 7. Testing & Validation

**Test cases:**

1. Generate one-time link with default role (viewer, manager, admin)
2. Generate one-time link with custom role
3. Verify recurring links don't show role selection
4. Verify recurring links still default to viewer
5. Verify permission checks work (non-admins can't assign admin role)
6. Verify existing one-time links (without role) still work (backward compatibility)
7. Verify custom role assignment creates both BoardMember and BoardMemberCustomRole records
8. Verify audit logs record correct role
9. Verify error handling for invalid custom role IDs
10. Verify UI resets properly when switching link types

## Data Flow

```javascript
1. User opens invite dialog
2. User selects "one-time" link type
3. Frontend fetches custom roles (if available)
4. User selects role (default or custom)
5. Frontend sends POST /boards/:id/invites/generate with { linkType: 'one_time', role: 'admin' } OR { linkType: 'one_time', customRoleId: 'uuid' }
6. Backend validates permissions and creates token with role info
7. User shares link
8. Recipient redeems link
9. Backend creates BoardMember with role from token
10. If customRoleId exists, backend creates BoardMemberCustomRole record
11. User is added to board with specified permissions
```



## Backward Compatibility

- Existing invite tokens without role fields will default to 'viewer' (NULL handling)
- Recurring links remain unchanged (no role selection, always viewer)
- API accepts requests without role fields (optional)
- No breaking changes to existing invite redemption flow

## Files to Modify

1. `backend/prisma/schema.prisma` - Add fields to BoardInviteToken
2. `backend/src/routes/boards.ts` - Update invite generation, add custom roles endpoint
3. `backend/src/routes/invites.ts` - Update redemption logic