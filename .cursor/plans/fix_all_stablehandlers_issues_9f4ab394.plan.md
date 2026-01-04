---
name: Fix All StableHandlers Issues
overview: Fix all missing stableHandlers definitions and replace inline realtime handlers with stable references to prevent stale closures. This includes BoardPage.tsx missing definition, Home.tsx nested subscription fix, and three component files that need stable handler wrappers.
todos:
  - id: phase1-boardpage
    content: "Phase 1: Add missing stableHandlers definition in BoardPage.tsx with all handler implementations"
    status: completed
  - id: phase2-home-nested
    content: "Phase 2: Fix Home.tsx nested subscription to use existing nestedStableHandlers instead of inline handlers"
    status: completed
  - id: phase3-invite-button
    content: "Phase 3: Wrap InviteLinkButton.tsx handlers with useStableRealtimeHandlers"
    status: completed
  - id: phase4-members-dialog
    content: "Phase 4: Wrap BoardMembersDialog.tsx handlers with useStableRealtimeHandlers"
    status: completed
  - id: phase5-settings-modal
    content: "Phase 5: Wrap BoardSettingsModal.tsx handlers with useStableRealtimeHandlers"
    status: completed
  - id: phase6-permissions-subscriptions
    content: "Phase 6: Fix subscribeBoardMembersForPermissions to return proper cleanup and use stable handlers"
    status: completed
  - id: phase7-permissions-realtime
    content: "Phase 7: Wrap usePermissionsRealtime.ts handlers with stable references"
    status: completed
---

# Fix All StableHand

lers Issues

## Problem Analysis

Multiple files have realtime subscription handlers that can cause stale closures:

1. **BoardPage.tsx**: `stableHandlers` is referenced but never defined
2. **Home.tsx**: Nested subscription uses inline handlers instead of existing `nestedStableHandlers`
3. **InviteLinkButton.tsx**: Inline handlers in useEffect can capture stale closures
4. **BoardMembersDialog.tsx**: Inline handlers in useEffect can capture stale closures
5. **BoardSettingsModal.tsx**: Inline handlers in useEffect can capture stale closures
6. **permissionsSubscriptions.ts**: `subscribeBoardMembersForPermissions` returns no-op cleanup and uses inline handlers that capture stale `boardId` and `handlers`
7. **usePermissionsRealtime.ts**: Inline handlers passed to subscription functions can have stale closures

## Implementation Plan

### Phase 1: Fix BoardPage.tsx Missing Definition

**File**: `src/pages/BoardPage.tsx`Add the missing `stableHandlers` definition using `useStableRealtimeHandlers` before the useEffect that uses it (around line 458, after `debouncedRefreshBoardMembers`).The handlers should include:

- `onBoardUpdate`: Handle board name/color updates incrementally, refetch for complex changes
- `onColumnUpdate`: Handle column updates with existing batching logic (disable batching in hook)
- `onCardUpdate`: Handle card updates with existing batching logic (disable batching in hook)
- `onCardDetailUpdate`: Handle card detail updates
- `onMemberUpdate`: Handle member updates with debounced refresh
- `onParentRefresh`: Handle parent refresh triggers

**Key Points**:

- Use `disableBatchingFor: ['onCardUpdate', 'onColumnUpdate']` to preserve existing color batching
- Include all necessary dependencies in the dependency array
- Place definition before the useEffect at line 601

### Phase 2: Fix Home.tsx Nested Subscription

**File**: `src/pages/Home.tsx` (line 610)Replace the inline handlers in the nested subscription with the existing `nestedStableHandlers` that's already defined at line 333.**Change**: Line 610-640 should use `nestedStableHandlers` instead of defining inline handlers.

### Phase 3: Fix InviteLinkButton.tsx

**File**: `src/components/kanban/InviteLinkButton.tsx`Wrap the inline handlers with `useStableRealtimeHandlers`:

1. Import `useStableRealtimeHandlers` at the top
2. Create `stableHandlers` using the hook before the useEffect (around line 73)
3. Move the handler logic from the useEffect into the hook
4. Update the useEffect to use `stableHandlers`
5. Include dependencies: `boardId`, `inviteLink`, `setActiveRecurringLinks`

### Phase 4: Fix BoardMembersDialog.tsx

**File**: `src/components/kanban/BoardMembersDialog.tsx`Wrap the inline handlers with `useStableRealtimeHandlers`:

1. Import `useStableRealtimeHandlers` at the top
2. Create `stableHandlers` using the hook before the useEffect (around line 54)
3. Move the handler logic from the useEffect into the hook
4. Update the useEffect to use `stableHandlers`
5. Include dependencies: `boardId`, `onMembersChange`

### Phase 5: Fix BoardSettingsModal.tsx

**File**: `src/components/kanban/BoardSettingsModal.tsx`Wrap the inline handlers with `useStableRealtimeHandlers`:

1. Import `useStableRealtimeHandlers` at the top
2. Create `stableHandlers` using the hook before the useEffect (around line 157)
3. Move the handler logic from the useEffect into the hook
4. Update the useEffect to use `stableHandlers`
5. Include dependencies: `boardId`, `onMembersChange`, `toast`, `currentUserId`

### Phase 6: Fix permissionsSubscriptions.ts

**File**: `src/realtime/permissionsSubscriptions.ts`

Fix `subscribeBoardMembersForPermissions` function:

1. Store the cleanup function returned from `subscribeWorkspaceViaRegistry`
2. Return the actual cleanup function instead of no-op
3. The inline handler captures `boardId` and `handlers` which can become stale
4. Since this is a utility function (not a hook), we need to ensure handlers are stable at the call site
5. The function should return the cleanup from `subscribeWorkspaceViaRegistry` to allow proper cleanup

**Key Points**:

- Store cleanup: `const cleanup = subscribeWorkspaceViaRegistry(...)`
- Return cleanup instead of `() => {}`
- Note: Handler stability is handled at call site (Phase 7)

### Phase 7: Fix usePermissionsRealtime.ts

**File**: `src/hooks/usePermissionsRealtime.ts`

Wrap inline handlers with stable references:

1. For `subscribeBoardMembersForPermissions` (line 157): Create stable handlers using `useStableRealtimeHandlers` or use `useRef` to store handlers
2. The handlers reference `user.id`, `handlePermissionChange`, `handleAccessRevoked` which are already in dependencies, but inline handlers can still be stale
3. Use `useRef` to store latest handler values and access them in stable wrapper functions
4. Apply same pattern to other subscription handlers if needed

**Key Points**:

- Use `useRef` to store latest `user.id`, `handlePermissionChange`, `handleAccessRevoked`
- Create stable wrapper functions that access refs
- Pass stable wrappers to subscription functions

## Testing Checklist

- [ ] BoardPage.tsx compiles without errors
- [ ] Home.tsx nested subscription uses stable handlers
- [ ] All component files use stable handlers
- [ ] No TypeScript errors
- [ ] Realtime updates work correctly in all affected components
- [ ] Handler cleanup functions are called properly

## Files Changed

- `src/pages/BoardPage.tsx` - Add missing stableHandlers definition

- `src/pages/Home.tsx` - Fix nested subscription to use nestedStableHandlers
- `src/components/kanban/InviteLinkButton.tsx` - Wrap handlers with useStableRealtimeHandlers
- `src/components/kanban/BoardMembersDialog.tsx` - Wrap handlers with useStableRealtimeHandlers
- `src/components/kanban/BoardSettingsModal.tsx` - Wrap handlers with useStableRealtimeHandlers
- `src/realtime/permissionsSubscriptions.ts` - Fix subscribeBoardMembersForPermissions cleanup
- `src/hooks/usePermissionsRealtime.ts` - Use stable handler references

## Comprehensive Analysis Summary

After thorough analysis of the codebase, all realtime subscription issues have been identified:

### Issues Found and Fixed:

1. ✅ **BoardPage.tsx** - Missing stableHandlers definition (Phase 1)
2. ✅ **Home.tsx** - Nested subscription using inline handlers (Phase 2)
3. ✅ **InviteLinkButton.tsx** - Inline handlers in useEffect (Phase 3)
4. ✅ **BoardMembersDialog.tsx** - Inline handlers in useEffect (Phase 4)
5. ✅ **BoardSettingsModal.tsx** - Inline handlers in useEffect (Phase 5)
6. ✅ **permissionsSubscriptions.ts** - Missing cleanup return (Phase 6)
7. ✅ **usePermissionsRealtime.ts** - Stale closures in inline handlers (Phase 7)

### Verified Safe:

- **usePermissionsData.ts** - Uses global subscriptions with `fetchData` in dependencies. Handler is recreated when `fetchData` changes, which is acceptable for global subscriptions.
- **realtimeClient.ts** - Low-level utility that passes handlers as parameters, no closure issues.
- **subscriptionRegistry.ts** - Already implements handler ownership tracking and cleanup.
- **workspaceSubscriptions.ts** - Already returns cleanup functions.

### After Implementation:

- All workspace subscriptions will use stable handlers via `useStableRealtimeHandlers`
- All component subscriptions will have proper cleanup
- All handler closures will reference latest values via refs
- Event batching will prevent channel queue overflow
- Handler deduplication will prevent processing stale events

**Conclusion**: This plan addresses all identified realtime subscription issues. No additional fixes are needed.

- `src/hooks/usePermissionsRealtime.ts` - Use stable handler references
- `src/hooks/usePermissionsRealtime.ts` - Use stable handler references

## Comprehensive Analysis Summary

After thorough analysis of the codebase, all realtime subscription issues have been identified:

### Issues Found and Fixed:

1. ✅ **BoardPage.tsx** - Missing stableHandlers definition (Phase 1)
2. ✅ **Home.tsx** - Nested subscription using inline handlers (Phase 2)
3. ✅ **InviteLinkButton.tsx** - Inline handlers in useEffect (Phase 3)
4. ✅ **BoardMembersDialog.tsx** - Inline handlers in useEffect (Phase 4)
5. ✅ **BoardSettingsModal.tsx** - Inline handlers in useEffect (Phase 5)
6. ✅ **permissionsSubscriptions.ts** - Missing cleanup return (Phase 6)
7. ✅ **usePermissionsRealtime.ts** - Stale closures in inline handlers (Phase 7)

### Verified Safe:

- **usePermissionsData.ts** - Uses global subscriptions with `fetchData` in dependencies. Handler is recreated when `fetchData` changes, which is acceptable for global subscriptions.
- **realtimeClient.ts** - Low-level utility that passes handlers as parameters, no closure issues.
- **subscriptionRegistry.ts** - Already implements handler ownership tracking and cleanup.
- **workspaceSubscriptions.ts** - Already returns cleanup functions.

### After Implementation:

- All workspace subscriptions will use stable handlers via `useStableRealtimeHandlers`
- All component subscriptions will have proper cleanup
- All handler closures will reference latest values via refs
- Event batching will prevent channel queue overflow
- Handler deduplication will prevent processing stale events