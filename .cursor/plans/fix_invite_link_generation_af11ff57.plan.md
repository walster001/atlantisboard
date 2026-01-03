---
name: Fix Invite Link Generation
overview: Replace the non-existent database function call with the permission service, add proper error handling, and implement realtime propagation for invite link events.
todos:
  - id: fix-backend-permissions
    content: Replace can_create_board_invite DB function calls with permissionService.requirePermission in all three invite endpoints (generate, list, delete)
    status: pending
  - id: add-realtime-emission
    content: Add emitDatabaseChange calls after successful invite token creation and deletion in backend routes
    status: pending
    dependencies:
      - fix-backend-permissions
  - id: add-invite-subscription
    content: Add board_invite_tokens table subscription handlers to workspaceSubscriptions.ts
    status: pending
  - id: handle-realtime-invites
    content: Update InviteLinkButton component to subscribe to invite link events and update UI in realtime
    status: pending
    dependencies:
      - add-invite-subscription
  - id: improve-error-handling
    content: Add comprehensive error logging with stack traces in backend invite routes
    status: pending
  - id: fix-invite-redemption
    content: Replace validate_and_redeem_invite_token DB function with backend service logic that adds users to board with viewer role
    status: pending
    dependencies:
      - fix-backend-permissions
---

# Fix Invite

Link Generation Internal Server Errors

## Problem Summary

The POST `/api/boards/:boardId/invites/generate` endpoint is failing with 500 Internal Server Error because it calls a non-existent database function `can_create_board_invite(uuid, uuid)`. Additionally, invite links are not propagated via realtime to other board members.

## Root Causes

1. **Backend Permission Check**: Uses non-existent DB function instead of permission service
2. **Missing Realtime Events**: No realtime propagation when invite links are created/deleted
3. **Incomplete Error Handling**: Errors may not be logged with full stack traces
4. **Invite Redemption**: Uses non-existent database function `validate_and_redeem_invite_token` - needs to be replaced with backend service logic that automatically adds users to board with viewer role

## Implementation Plan

### 1. Backend: Fix Permission Checks

**File**: `backend/src/routes/boards.ts`Replace the database function calls with permission service checks:

- Line 133-139: Replace `can_create_board_invite` DB function call with `permissionService.requirePermission('board.invite.create', context)`
- Line 187-193: Replace permission check for GET invites endpoint
- Line 225-231: Replace permission check for DELETE invites endpoint

**Changes**:

- Import `permissionService` from `../lib/permissions/service.js`
- Build permission context using `permissionService.buildContext(userId, isAppAdmin, boardId)`
- Use `await permissionService.requirePermission('board.invite.create', context)` or `board.invite.delete` as appropriate

### 2. Backend: Add Realtime Event Emission

**File**: `backend/src/routes/boards.ts`Emit realtime events when invite links are created or deleted:

- After successful token creation (line ~167): Emit `emitDatabaseChange('boardInviteToken', 'INSERT', insertedToken, undefined, boardId)`
- After successful token deletion (line ~245): Emit `emitDatabaseChange('boardInviteToken', 'DELETE', undefined, token, boardId)`

**Changes**:

- Import `emitDatabaseChange` from `../realtime/emitter.js`
- Emit events after successful database operations

### 3. Frontend: Add Realtime Subscription for Invite Links

**File**: `src/realtime/workspaceSubscriptions.ts`Add subscription handlers for `board_invite_tokens` table changes:

- Add INSERT handler for new invite links
- Add DELETE handler for deleted invite links
- Filter by boardId to ensure events are scoped correctly

**Changes**:

- Add event handlers in `subscribeWorkspace` function for `board_invite_tokens` table
- Create new handler type `onInviteUpdate` in `WorkspaceHandlers` interface

### 4. Frontend: Handle Realtime Invite Events

**File**: `src/components/kanban/InviteLinkButton.tsx`Subscribe to invite link events and update UI:

- Subscribe to workspace channel for invite link events
- Update `activeRecurringLinks` state when new recurring links are created
- Remove links from state when deleted via realtime

**Changes**:

- Use `subscribeWorkspace` or board-specific subscription
- Handle `board_invite_tokens` INSERT/DELETE events
- Update state accordingly

### 5. Backend: Improve Error Handling

**File**: `backend/src/routes/boards.ts`Add comprehensive error logging:

- Log full error stack traces in catch blocks
- Include request context (userId, boardId, linkType) in error logs

**Changes**:

- Add `console.error` with full error details before calling `next(error)`

### 6. Backend: Fix Invite Redemption Logic

**File**: `backend/src/routes/invites.ts`Replace the database function call with backend service logic that automatically adds users to the board with viewer permissions:

- Line 30-39: Replace `validate_and_redeem_invite_token` DB function call with backend logic
- Validate token exists and is not expired
- Check if token is already used (for one-time links)
- Check if user is already a board member
- Add user to board with 'viewer' role using `memberService.addBoardMember`
- Mark one-time tokens as used (update `usedAt` and `usedBy` fields)
- Return appropriate error responses (404 for invalid, 410 for expired/already used)

**Changes**:

- Import `memberService` from `../services/member.service.js`
- Import `emitDatabaseChange` from `../realtime/emitter.js`
- Query token from database using Prisma
- Validate expiration (check `expiresAt` for one-time links)
- Check if already used (for one-time: `usedAt` is not null)
- Check existing board membership
- Add user as viewer if not already member
- Update token record for one-time links
- Emit realtime events for board member addition

### 7. Validation: Error Response Format

**File**: `backend/src/routes/boards.ts` and `backend/src/routes/invites.ts`Ensure consistent error response format:

- Verify error handler middleware properly formats 500 errors
- Ensure validation errors return appropriate status codes (400 for validation, 403 for permission, 404 for not found, 410 for expired/already used)

## Testing Checklist

- [ ] Generate one_time invite link → verify success response and UI update
- [ ] Generate recurring invite link → verify success response and UI update
- [ ] Verify invite link appears in UI without page refresh
- [ ] Verify other board members see new invite links via realtime
- [ ] Verify permission checks work (non-admin users get 403)
- [ ] Verify error handling logs full stack traces
- [ ] Test with invalid boardId → verify proper error response
- [ ] Test with invalid linkType → verify validation error
- [ ] Redeem one_time invite link → verify user added to board as viewer
- [ ] Redeem recurring invite link → verify user added to board as viewer
- [ ] Redeem already-used one_time link → verify 410 error
- [ ] Redeem expired one_time link → verify 410 error
- [ ] Redeem invite when already a member → verify already_member response
- [ ] Verify realtime event emitted when user joins via invite

## Files to Modify

1. `backend/src/routes/boards.ts` - Fix permission checks, add realtime events, improve error handling
2. `backend/src/routes/invites.ts` - Replace database function with backend service logic for token redemption
3. `src/realtime/workspaceSubscriptions.ts` - Add invite token subscription handlers
4. `src/components/kanban/InviteLinkButton.tsx` - Handle realtime invite events