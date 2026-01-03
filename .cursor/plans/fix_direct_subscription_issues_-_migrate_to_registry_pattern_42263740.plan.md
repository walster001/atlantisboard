---
name: Fix Direct Subscription Issues - Migrate to Registry Pattern
overview: Migrate all components using direct subscribeWorkspace() calls to use the subscription registry pattern, preventing WebSocket disconnect/reconnect issues when modals/dialogs open and close.
todos:
  - id: enhance-registry-handler-management
    content: "Phase 1.1: Enhance Subscription Registry - Add handler management to support multiple handlers per workspace, track handlers separately from subscriptions"
    status: completed
  - id: add-handler-registration-methods
    content: "Phase 1.2: Add Handler Registration Methods - Implement addWorkspaceHandler(), removeWorkspaceHandler(), getWorkspaceHandlers() methods"
    status: completed
    dependencies:
      - enhance-registry-handler-management
  - id: update-workspace-subscription-handler
    content: "Phase 1.3: Update Workspace Subscription Handler - Modify subscribeWorkspace() to support multiple handlers, merge handlers when multiple components subscribe"
    status: completed
    dependencies:
      - add-handler-registration-methods
  - id: migrate-board-settings-modal
    content: "Phase 2.1: Migrate BoardSettingsModal - Replace direct subscribeWorkspace() with registry pattern, remove cleanup function"
    status: completed
    dependencies:
      - update-workspace-subscription-handler
  - id: migrate-board-members-dialog
    content: "Phase 2.2: Migrate BoardMembersDialog - Replace direct subscribeWorkspace() with registry pattern, remove cleanup function"
    status: completed
    dependencies:
      - update-workspace-subscription-handler
  - id: migrate-invite-link-button
    content: "Phase 2.3: Migrate InviteLinkButton - Replace direct subscribeWorkspace() with registry pattern, remove cleanup function"
    status: completed
    dependencies:
      - update-workspace-subscription-handler
  - id: migrate-permissions-realtime
    content: "Phase 2.4: Migrate usePermissionsRealtime - Refactor subscribeBoardMembersForPermissions() to use workspace registry, add handlers to existing subscription"
    status: completed
    dependencies:
      - update-workspace-subscription-handler
  - id: update-permission-subscriptions
    content: "Phase 3.1: Update subscribeBoardMembersForPermissions - Change to use workspace registry instead of direct subscribeToChanges()"
    status: completed
    dependencies:
      - migrate-permissions-realtime
  - id: test-modal-dialog-lifecycle
    content: "Phase 4.1: Test Modal/Dialog Lifecycle - Open/close modals multiple times, verify no WebSocket disconnects, events still received"
    status: completed
    dependencies:
      - migrate-board-settings-modal
      - migrate-board-members-dialog
      - migrate-invite-link-button
  - id: test-multiple-components
    content: "Phase 4.2: Test Multiple Components - Have multiple components active simultaneously, verify no conflicts, events received correctly"
    status: completed
    dependencies:
      - migrate-board-settings-modal
      - migrate-board-members-dialog
  - id: test-permission-updates
    content: "Phase 4.3: Test Permission Updates - Trigger permission changes with multiple components active, verify all receive updates"
    status: completed
    dependencies:
      - migrate-permissions-realtime
  - id: test-edge-cases
    content: "Phase 4.4: Test Edge Cases - Rapid open/close, navigation, multiple workspaces, verify no memory leaks"
    status: completed
    dependencies:
      - test-modal-dialog-lifecycle
      - test-multiple-components
---

# Fix

Direct Subscription Issues - Migrate to Registry PatternPlan to fix WebSocket disconnect/reconnect issues caused by components creating direct subscriptions instead of using the subscription registry.

## Problem Summary

Four components are creating direct workspace subscriptions that unsubscribe entire channels on cleanup, causing disconnects for other components:

1. **BoardSettingsModal** - Direct `subscribeWorkspace()` call
2. **BoardMembersDialog** - Direct `subscribeWorkspace()` call  
3. **InviteLinkButton** - Direct `subscribeWorkspace()` call
4. **usePermissionsRealtime** - Direct `subscribeToChanges()` via `subscribeBoardMembersForPermissions()`

## Root Cause

- Components call `subscribeWorkspace()` directly instead of using `subscribeWorkspaceViaRegistry()`
- When components unmount, cleanup calls `removeChannel()` which unsubscribes the entire workspace channel
- Other components (Home, BoardPage) lose their subscriptions and trigger reconnects
- No reference counting or handler tracking to safely remove only specific handlers

## Solution Approach

### Option 1: Migrate to Registry Pattern (Recommended)

- Convert all direct subscriptions to use `subscribeWorkspaceViaRegistry()`
- Registry prevents duplicate subscriptions and persists them
- Components add handlers to existing subscriptions
- No cleanup needed - subscriptions persist across component lifecycle

### Option 2: Handler-Based Subscription System

- Implement handler registration/unregistration system
- Components register handlers without creating new subscriptions
- Only unsubscribe channel when last handler is removed
- More complex but allows fine-grained control

**Recommended: Option 1** - Simpler, aligns with existing architecture, proven pattern

## Implementation Plan

### Phase 1: Enhance Subscription Registry

**1.1 Add Handler Management to Registry**

- Modify `SubscriptionRegistry` to support multiple handlers per workspace
- Track handlers separately from subscriptions
- Allow adding/removing handlers without affecting channel subscription
- Maintain backward compatibility with existing single-handler pattern

**1.2 Add Handler Registration Methods**

- `addWorkspaceHandler(workspaceId, handlers)` - Add handlers to existing subscription
- `removeWorkspaceHandler(workspaceId, handlerId)` - Remove specific handlers
- `getWorkspaceHandlers(workspaceId)` - Get all handlers for a workspace

**1.3 Update Workspace Subscription Handler**

- Modify `subscribeWorkspace()` to support multiple handlers
- Merge handlers when multiple components subscribe to same workspace
- Call all registered handlers when events are received

### Phase 2: Migrate Components

**2.1 Migrate BoardSettingsModal**

- Replace direct `subscribeWorkspace()` with registry pattern
- Use `subscribeWorkspaceViaRegistry()` or handler registration
- Remove cleanup function (registry manages lifecycle)
- Test: Open/close modal multiple times, verify no disconnects

**2.2 Migrate BoardMembersDialog**

- Replace direct `subscribeWorkspace()` with registry pattern
- Use `subscribeWorkspaceViaRegistry()` or handler registration
- Remove cleanup function
- Test: Open/close dialog, verify member updates still work

**2.3 Migrate InviteLinkButton**

- Replace direct `subscribeWorkspace()` with registry pattern
- Use `subscribeWorkspaceViaRegistry()` or handler registration
- Remove cleanup function
- Test: Open/close invite dialog, verify invite updates still work

**2.4 Migrate usePermissionsRealtime**

- Refactor `subscribeBoardMembersForPermissions()` to use workspace registry
- Add handlers to existing workspace subscription instead of creating new one
- Ensure handlers are properly scoped to boardId
- Test: Permission changes trigger correctly, no duplicate subscriptions

### Phase 3: Refactor Permission Subscriptions

**3.1 Update subscribeBoardMembersForPermissions**

- Change to use workspace registry instead of direct `subscribeToChanges()`
- Add handlers to existing workspace subscription
- Filter by boardId in handler logic (already done)
- Maintain backward compatibility

**3.2 Consider Global Permission Channels**

- Evaluate if `subscribeCustomRoles()` and `subscribeRolePermissions()` need registry
- These use global channels, less likely to conflict
- May not need changes, but document decision

### Phase 4: Testing & Verification

**4.1 Test Modal/Dialog Lifecycle**

- Open/close BoardSettingsModal multiple times rapidly
- Open/close BoardMembersDialog multiple times
- Open/close InviteLinkButton dialog multiple times
- Verify: No WebSocket disconnects/reconnects in console
- Verify: Events still received correctly

**4.2 Test Multiple Components**

- Have BoardSettingsModal and BoardPage both active
- Verify: Both receive events, no conflicts
- Verify: Closing modal doesn't affect BoardPage subscription

**4.3 Test Permission Updates**

- Trigger permission changes while multiple components are active
- Verify: All components receive updates correctly
- Verify: No duplicate event processing

**4.4 Test Edge Cases**

- Rapid open/close of multiple modals
- Navigate between pages while modals are open
- Test with multiple workspaces
- Verify: No memory leaks, subscriptions properly cleaned up

## Files to Modify

### Backend Files

None - this is a frontend-only change

### Frontend Files

1. **[src/realtime/subscriptionRegistry.ts](src/realtime/subscriptionRegistry.ts)**

- Add handler management methods
- Support multiple handlers per workspace
- Track handler lifecycle

2. **[src/realtime/workspaceSubscriptions.ts](src/realtime/workspaceSubscriptions.ts)**

- Update `subscribeWorkspace()` to support multiple handlers
- Merge handlers when multiple subscriptions exist
- Call all handlers when events received

3. **[src/components/kanban/BoardSettingsModal.tsx](src/components/kanban/BoardSettingsModal.tsx)**

- Replace `subscribeWorkspace()` with registry pattern
- Remove cleanup function
- Use persistent subscription

4. **[src/components/kanban/BoardMembersDialog.tsx](src/components/kanban/BoardMembersDialog.tsx)**

- Replace `subscribeWorkspace()` with registry pattern
- Remove cleanup function
- Use persistent subscription

5. **[src/components/kanban/InviteLinkButton.tsx](src/components/kanban/InviteLinkButton.tsx)**

- Replace `subscribeWorkspace()` with registry pattern
- Remove cleanup function
- Use persistent subscription

6. **[src/realtime/permissionsSubscriptions.ts](src/realtime/permissionsSubscriptions.ts)**

- Refactor `subscribeBoardMembersForPermissions()` to use registry
- Add handlers to existing workspace subscription

7. **[src/hooks/usePermissionsRealtime.ts](src/hooks/usePermissionsRealtime.ts)**

- Update to use refactored permission subscriptions
- Ensure proper cleanup (if needed)

## Implementation Details

### Handler Management Pattern

```typescript
// In SubscriptionRegistry
class SubscriptionRegistry {
  private handlers: Map<string, Set<WorkspaceHandlers>> = new Map();
  
  addWorkspaceHandler(workspaceId: string, handlers: WorkspaceHandlers): string {
    if (!this.handlers.has(workspaceId)) {
      this.handlers.set(workspaceId, new Set());
    }
    const handlerId = generateId();
    this.handlers.get(workspaceId)!.add(handlers);
    
    // Subscribe if not already subscribed
    if (!this.subscriptions.has(workspaceId)) {
      this.subscribeWorkspace(workspaceId, this.mergeHandlers(workspaceId));
    }
    
    return handlerId;
  }
  
  removeWorkspaceHandler(workspaceId: string, handlerId: string): void {
    // Remove handler, update subscription if needed
  }
  
  private mergeHandlers(workspaceId: string): WorkspaceHandlers {
    // Merge all handlers for workspace into single handler set
  }
}
```



### Component Migration Pattern

```typescript
// Before (problematic)
useEffect(() => {
  if (!open || !workspaceId) return;
  const cleanup = subscribeWorkspace(workspaceId, {
    onMemberUpdate: (member, event) => { ... }
  });
  return cleanup;
}, [open, workspaceId]);

// After (using registry)
useEffect(() => {
  if (!open || !workspaceId) return;
  subscribeWorkspaceViaRegistry(workspaceId, {
    onMemberUpdate: (member, event) => { ... }
  });
  // No cleanup - registry manages lifecycle
}, [open, workspaceId]);
```



## Success Criteria

- No WebSocket disconnects/reconnects when opening/closing modals
- All components receive realtime events correctly
- No duplicate event processing
- Subscriptions persist across component lifecycle
- Memory leaks prevented (proper cleanup when workspace access revoked)
- Backward compatibility maintained for existing components

## Migration Notes

- Backward compatible: Existing components (Home, BoardPage) continue to work
- No breaking changes to subscription API
- Can be deployed incrementally (migrate one component at a time)
- Rollback: Revert component changes if issues arise

## Performance Considerations

- Handler merging adds minimal overhead
- Registry lookups are O(1) Map operations