---
name: Fix Realtime Implementation
overview: Comprehensive fix for realtime WebSocket implementation addressing connection lifecycle management, subscription persistence, performance optimization (console logging cleanup), reconnection handling, payload optimization, and client-side state persistence.
todos:
  - id: create-realtime-manager
    content: Create src/lib/realtimeManager.ts - Global WebSocket connection lifecycle manager
    status: completed
  - id: update-auth-provider
    content: Update src/hooks/useAuth.tsx to initialize/disconnect realtime connection on login/logout
    status: completed
    dependencies:
      - create-realtime-manager
  - id: update-api-client-realtime
    content: Update src/integrations/api/realtime.ts for external connection management, remove auto-connect from addChannel()
    status: in_progress
    dependencies:
      - create-realtime-manager
  - id: create-subscription-registry
    content: Create src/realtime/subscriptionRegistry.ts - Global workspace subscription registry
    status: pending
  - id: update-workspace-subscriptions
    content: Update src/realtime/workspaceSubscriptions.ts to integrate with subscription registry
    status: pending
    dependencies:
      - create-subscription-registry
  - id: update-home-component
    content: Update src/pages/Home.tsx to use subscription registry, remove cleanup from useEffect
    status: pending
    dependencies:
      - create-subscription-registry
      - update-workspace-subscriptions
  - id: update-board-page
    content: Update src/pages/BoardPage.tsx to use subscription registry, remove cleanup from useEffect
    status: pending
    dependencies:
      - create-subscription-registry
      - update-workspace-subscriptions
  - id: cleanup-client-logs
    content: Remove high-frequency console.log statements from src/integrations/api/realtime.ts (lines 211, 285, 297, 303, 308, 313, 329, 336, 357, 361, 365)
    status: pending
  - id: cleanup-server-logs
    content: Remove high-frequency console.log statements from backend/src/realtime/server.ts (lines 390, 402, 693)
    status: pending
  - id: cleanup-component-logs
    content: Remove high-frequency realtime event logging from src/pages/BoardPage.tsx and src/hooks/usePermissionsRealtime.ts
    status: pending
  - id: optimize-reconnection
    content: Update src/integrations/api/realtime.ts to prevent duplicate subscriptions on reconnect (track server-restored channels)
    status: pending
    dependencies:
      - update-api-client-realtime
  - id: optimize-payloads
    content: Update backend/src/realtime/server.ts to send only changed fields for UPDATE events (differential updates)
    status: pending
  - id: add-client-persistence
    content: Add localStorage persistence for channel subscriptions in src/integrations/api/realtime.ts and subscription registry
    status: pending
    dependencies:
      - create-subscription-registry
      - update-api-client-realtime
---

# Fix Realtime Implementation

Comprehensive plan to optimize WebSocket realtime implementation based on analysis findings. Addresses connection lifecycle, subscription management, performance (console logging), reconnection logic, payload optimization, and client persistence.

## Current Issues

1. **Connection Lifecycle**: WebSocket disconnects/reconnects on navigation/component unmount
2. **Subscription Management**: Channels unsubscribed on component cleanup, causing reconnects
3. **Performance**: High-frequency console.log statements causing lag (25+ logs per event)
4. **Reconnection**: Duplicate subscription attempts when server already restores channels
5. **Payload Size**: Full records sent for UPDATE events (no differential updates)
6. **Client State**: Channel subscriptions not persisted across page refreshes

## Architecture Changes

### Connection Persistence Strategy

Move WebSocket connection management from component-level to app-level (AuthProvider). Connection should:

- Initialize once when user logs in
- Stay alive across navigation/component unmounts
- Only disconnect on explicit logout or browser close
- Persist across page refreshes (with token re-authentication)

### Subscription Registry Pattern

Create global subscription registry to:

- Track active workspace subscriptions at app level
- Register subscriptions on login/workspace access
- Unregister only on logout/access revocation
- Prevent duplicate subscriptions

## Implementation Plan

### Phase 1: Connection Persistence & Global Management

**1.1 Create Global Realtime Manager**Create `src/lib/realtimeManager.ts`:

- Singleton manager for WebSocket connection lifecycle
- Methods: `initialize()`, `disconnect()`, `isConnected()`
- Manages connection state independent of components
- Handles token refresh and re-authentication

**1.2 Update AuthProvider to Manage Connection**Modify `src/hooks/useAuth.tsx`:

- Initialize realtime connection when user logs in
- Disconnect on logout
- Sync auth token changes to realtime client
- Connection persists across navigation (no cleanup in useEffect)

**1.3 Update API Client Realtime**Modify `src/integrations/api/realtime.ts`:

- Remove connection initialization from `addChannel()`
- Connection initialized externally (via realtimeManager)
- Add `ensureConnected()` method that doesn't reconnect if already connected
- Track connection state globally

### Phase 2: Global Subscription Registry

**2.1 Create Subscription Registry**Create `src/realtime/subscriptionRegistry.ts`:

- Global registry tracking active workspace subscriptions
- Methods: `subscribeWorkspace()`, `unsubscribeWorkspace()`, `unsubscribeAll()`
- Prevents duplicate subscriptions
- Stores cleanup functions per workspace

**2.2 Update Workspace Subscriptions**Modify `src/realtime/workspaceSubscriptions.ts`:

- Integration with subscription registry
- Registry handles subscription lifecycle
- Components register/unregister via registry

**2.3 Update Component Usage**Modify `src/pages/Home.tsx` and `src/pages/BoardPage.tsx`:

- Remove cleanup functions from useEffect (subscriptions persist)
- Use subscription registry for workspace subscriptions
- Only unregister on workspace access revocation (from realtime event)

### Phase 3: Console Logging Cleanup

**3.1 Remove High-Frequency Logs (Client)**Modify `src/integrations/api/realtime.ts`:

- Remove lines 211, 285, 297, 303, 308, 313, 329, 336, 357, 361, 365 (per-event logging)
- Keep error/warning logs (lines 87, 97, 126, 131, 251, 254, 415)
- Keep connection lifecycle logs (lines 106, 135, 153, 190) but make DEV-only
- Optional: Add env flag for verbose realtime logging

**3.2 Remove High-Frequency Logs (Server)**Modify `backend/src/realtime/server.ts`:

- Remove lines 390, 402, 693 (per-event broadcast logging)
- Keep error/warning logs
- Keep connection lifecycle logs but reduce verbosity
- Consider structured logging for production

**3.3 Remove High-Frequency Logs (Components)**Modify `src/pages/BoardPage.tsx`:

- Remove realtime event logging (lines 482, 488, 584, 608, 626, 651, 658, 661, 765, 773, 781, 790, 795, 807, 819)
- Keep error/warning logs
- Optionally use logRealtime() wrapper for DEV-only logging

Modify `src/hooks/usePermissionsRealtime.ts`:

- Remove or make DEV-only line 64 (permission change logging)
- Keep error/warning logs

### Phase 4: Reconnection Optimization

**4.1 Prevent Duplicate Subscriptions**Modify `src/integrations/api/realtime.ts`:

- Track server-restored channels from system messages
- On reconnect, check server state before resubscribing
- Only subscribe to channels not already restored by server
- Add deduplication logic in `subscribeToChannel()`

**4.2 Server Channel Restoration**Verify `backend/src/realtime/server.ts`:

- Server already sends "subscribed" messages for restored channels (lines 151-163)
- Client should trust server state and avoid duplicate subscriptions
- Ensure restoration message format is consistent

### Phase 5: Payload Optimization

**5.1 Differential Updates for UPDATE Events**Modify `backend/src/realtime/server.ts`:

- In `emitDatabaseChange()`, compute changed fields for UPDATE events
- Send only changed fields in payload: `{ changedFields: {...}, id: string }`
- Keep full record for INSERT events
- Send minimal data for DELETE events: `{ id: string, entityType: string }`

**5.2 Client-Side Payload Handling**Modify `src/integrations/api/realtime.ts` and event handlers:

- Handle differential updates in event processing
- Merge changedFields with existing state
- Maintain backward compatibility with full record format (fallback)

### Phase 6: Client-Side State Persistence

**6.1 Persist Channel Subscriptions**Modify `src/integrations/api/realtime.ts`:

- Save subscribed channels to localStorage on subscribe
- Restore channels from localStorage on initialization
- Sync with server state on connection
- Clear on logout

**6.2 Subscription Registry Persistence**Modify `src/realtime/subscriptionRegistry.ts`:

- Persist workspace subscriptions to localStorage
- Restore on page load
- Sync with server on connection establishment

## Testing Strategy

1. **Connection Persistence**: Navigate between pages, verify WebSocket stays connected
2. **Subscription Persistence**: Navigate away/back, verify subscriptions remain active
3. **Performance**: Monitor console output, verify reduced logging
4. **Reconnection**: Simulate network disconnect, verify no duplicate subscriptions
5. **Payload Optimization**: Verify UPDATE events send only changed fields
6. **State Persistence**: Refresh page, verify subscriptions restored

## Migration Notes

- Backward compatible: Server continues to send full records (client handles both)
- Gradual rollout: Can deploy backend payload optimization separately
- Monitoring: Add metrics for connection lifetime, subscription counts
- Rollback: Changes are mostly additive, can revert if issues arise

## Files to Modify

**New Files:**