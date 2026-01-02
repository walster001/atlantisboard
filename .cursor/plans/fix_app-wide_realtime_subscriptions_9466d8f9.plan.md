---
name: Fix App-Wide Realtime Subscriptions
overview: Systematically audit and fix all realtime subscriptions across the app to ensure bidirectional, dynamic updates for columns, cards, members, roles, and workspaces without requiring page refreshes.
todos:
  - id: phase1-1
    content: Fix card color update error for user A - investigate and fix updateCardColor function
    status: completed
  - id: phase1-2
    content: Audit all backend event emissions - verify complete payloads with all required fields
    status: completed
  - id: phase1-3
    content: Fix channel subscription persistence - ensure userChannels map is properly maintained
    status: completed
  - id: phase2-1
    content: Fix column subscription filter - update matchesFilter to handle both camelCase and snake_case
    status: completed
  - id: phase2-2
    content: Fix card subscription for all clients - ensure subscribeBoardCards is called unconditionally
    status: completed
  - id: phase2-3
    content: Fix member subscription payload handling - ensure handlers fetch full data if incomplete
    status: completed
  - id: phase2-4
    content: Fix card move/reorder handling - ensure columnId changes trigger proper state updates
    status: completed
  - id: phase3-1
    content: Fix permission realtime updates - ensure role changes trigger permission recalculation
    status: completed
  - id: phase3-2
    content: Fix app admin role updates - add realtime event emission for profile.isAdmin changes
    status: completed
  - id: phase3-3
    content: Fix workspace membership auto-add/remove - ensure events reach all affected clients
    status: completed
  - id: phase4-1
    content: Fix column state updates - review onUpdate handler logic for position changes
    status: pending
  - id: phase4-2
    content: Fix card state updates for moves - ensure columnIdsRef is updated and moves handled
    status: pending
  - id: phase4-3
    content: Add toast notifications - ensure all membership and role changes show toasts
    status: pending
  - id: phase4-4
    content: Fix redirect on member removal - ensure user removed from board is redirected
    status: pending
  - id: phase5-1
    content: Add comprehensive logging - verify events emitted, received, and state updated
    status: pending
  - id: phase5-2
    content: Test all scenarios - two users, role changes, moves, removals
    status: pending
    dependencies:
      - phase1-1
      - phase1-2
      - phase1-3
      - phase2-1
      - phase2-2
      - phase2-3
      - phase2-4
      - phase3-1
      - phase3-2
      - phase3-3
      - phase4-1
      - phase4-2
      - phase4-3
      - phase4-4
  - id: phase5-3
    content: Fix any inconsistencies found during testing and remove debug logs
    status: pending
    dependencies:
      - phase5-2
---

# Fix App-Wide Realtime Subscriptions

## Current State Analysis

**Working:**

- UUID extraction from channel names (fixed)
- Card title/description updates
- Backend event emissions exist for all entities

**Partially Working:**

- Card color updates (user B receives, user A errors)

**Not Working:**

- Column create/delete/reorder/move
- Card moves between columns
- Board member add/remove
- Board member role updates
- App admin role updates
- Workspace membership auto-add/remove

## Root Cause Analysis

Based on code review, the issues stem from:

1. **Filter Matching**: Frontend filters use `boardId=eq.${boardId}` but backend may emit events with different field names (camelCase vs snake_case)
2. **Channel Subscription Gaps**: One client missing `board-{uuid}-cards` channel subscription
3. **Event Payload Mismatches**: Backend emits full Prisma records, frontend expects specific field formats
4. **Missing Permission Updates**: Role changes don't trigger permission recalculation
5. **State Update Logic**: Some handlers have early returns that prevent updates

## Implementation Plan

### Phase 1: Infrastructure Audit & Fixes

**1.1 Fix Card Color Update Error (User A)**

- **File**: `src/pages/BoardPage.tsx` (line 661-666)
- **Issue**: `updateCardColor` uses direct API call, may not trigger realtime properly
- **Fix**: Ensure `updateCardColor` waits for realtime event or verify card UPDATE events include color field
- **Verify**: Check if card UPDATE events from backend include `color` field in payload

**1.2 Audit Backend Event Emissions**

- **Files**: 
- `backend/src/services/column.service.ts` (lines 48, 118, 141, 172)
- `backend/src/services/card.service.ts` (lines 86, 191, 217, 264)
- `backend/src/services/member.service.ts` (lines 140, 163, 321, 345, 452)
- **Action**: Verify all mutations emit events with complete payloads including all required fields
- **Fix**: Ensure `emitDatabaseChange` calls include full record data with all relationships

**1.3 Fix Channel Subscription Persistence**

- **File**: `backend/src/realtime/server.ts` (lines 95-129)
- **Issue**: One client loses subscriptions on reconnect
- **Fix**: Ensure `userChannels` map is properly maintained and restored on reconnect
- **Verify**: Log subscription restoration in `handleConnection`

### Phase 2: Frontend Subscription Fixes

**2.1 Fix Column Subscription Filter**

- **File**: `src/realtime/boardSubscriptions.ts` (lines 58-94)
- **Issue**: Filter uses `boardId=eq.${boardId}` but backend may emit with different field casing
- **Fix**: Update `matchesFilter` in `src/integrations/api/realtime.ts` to handle both camelCase and snake_case for `boardId`
- **Verify**: Test column create/update/delete events are received

**2.2 Fix Card Subscription for All Clients**

- **File**: `src/pages/BoardPage.tsx` (lines 176-268)
- **Issue**: One client not subscribing to cards channel
- **Fix**: Ensure `subscribeBoardCards` is called unconditionally when `boardId` exists
- **Verify**: Both clients show cards channel in subscription logs

**2.3 Fix Member Subscription Payload Handling**

- **File**: `src/pages/BoardPage.tsx` (lines 332-420)
- **Issue**: Member events may have incomplete payloads
- **Fix**: Ensure handlers fetch full member data if payload is incomplete
- **Verify**: Member add/remove updates UI immediately

**2.4 Fix Card Move/Reorder Handling**

- **File**: `src/pages/BoardPage.tsx` (lines 198-255)
- **Issue**: Card move between columns may not update state correctly
- **Fix**: Ensure `columnId` change triggers proper state update and card appears in new column
- **Verify**: Moving card between columns updates both clients

### Phase 3: Permission & Role Realtime Sync

**3.1 Fix Permission Realtime Updates**

- **File**: `src/hooks/usePermissionsRealtime.ts` (lines 153-177)
- **Issue**: Role changes don't trigger permission recalculation
- **Fix**: Ensure `handlePermissionChange` is called for all role updates and triggers permission refresh
- **Verify**: Role changes update permissions immediately

**3.2 Fix App Admin Role Updates**

- **Files**: 
- `backend/src/services/member.service.ts` (check if app admin role changes emit events)
- `src/hooks/usePermissionsRealtime.ts` (add subscription for profile.isAdmin changes)
- **Issue**: App admin role changes may not emit realtime events
- **Fix**: Add realtime event emission for profile.isAdmin updates
- **Verify**: App admin role changes propagate in realtime

**3.3 Fix Workspace Membership Auto-Add/Remove**

- **File**: `backend/src/services/member.service.ts` (lines 97-163, 280-345)
- **Issue**: Workspace membership events may not reach all affected clients
- **Fix**: Ensure workspace membership INSERT/DELETE events are emitted to correct channels
- **Verify**: Adding user to board auto-adds to workspace, removing from last board auto-removes

### Phase 4: State Update & UI Feedback

**4.1 Fix Column State Updates**

- **File**: `src/pages/BoardPage.tsx` (lines 270-320)
- **Issue**: Column updates may have early returns preventing state changes
- **Fix**: Review `onUpdate` handler logic, ensure position changes trigger updates
- **Verify**: Column reorder updates UI immediately

**4.2 Fix Card State Updates for Moves**

- **File**: `src/pages/BoardPage.tsx` (lines 249-255)
- **Issue**: Card moves may filter out cards incorrectly
- **Fix**: Ensure `columnIdsRef` is updated when columns change, handle card moves properly
- **Verify**: Card moves between columns update both clients

**4.3 Add Toast Notifications**

- **Files**: 
- `src/pages/BoardPage.tsx` (add toasts for member add/remove/role change)
- `src/components/kanban/BoardSettingsModal.tsx` (verify toasts exist)
- **Issue**: Some actions don't show toast notifications
- **Fix**: Add toasts for all membership and role changes
- **Verify**: Toasts appear for all relevant actions

**4.4 Fix Redirect on Member Removal**

- **File**: `src/pages/BoardPage.tsx` (lines 366-420)
- **Issue**: User removed from board may not be redirected
- **Fix**: Ensure `onDelete` handler checks if current user was removed and redirects
- **Verify**: Removing user while viewing board redirects to homepage

### Phase 5: Verification & Testing

**5.1 Add Comprehensive Logging**

- **Files**: All service files and realtime handlers
- **Action**: Add logging to verify:
- Events are emitted with correct payloads
- Events are received by all subscribed clients
- State updates occur without refresh
- **Remove**: Clean up debug logs after verification

**5.2 Test Scenarios**

- Two users on same board (columns, cards, members)
- Two users on different boards in same workspace
- Removing user while viewing board
- Changing roles live
- Moving columns/cards live
- App admin role changes

**5.3 Fix Any Inconsistencies**

- Review logs for missing events
- Fix any payload mismatches
- Ensure all mutations emit events
- Verify bidirectional delivery

## Key Files to Modify

1. `backend/src/realtime/server.ts` - Channel subscription persistence
2. `backend/src/services/column.service.ts` - Verify event emissions
3. `backend/src/services/card.service.ts` - Verify event emissions
4. `backend/src/services/member.service.ts` - Verify event emissions
5. `src/integrations/api/realtime.ts` - Filter matching logic
6. `src/pages/BoardPage.tsx` - Subscription setup and handlers
7. `src/realtime/boardSubscriptions.ts` - Subscription filters
8. `src/hooks/usePermissionsRealtime.ts` - Permission updates

## Success Criteria

- All mutations propagate instantly to all affected clients
- No page refresh required for any updates
- Permissions update dynamically
- Toast notifications appear for all actions
- Removed users are redirected if viewing board