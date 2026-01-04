---
name: Fix Realtime Handler Closures and Channel Queue Overflow
overview: Fix stale handler closures causing realtime updates to fail, and implement event batching to prevent channel queue overflow when rapid events arrive. Use stable handler references with useRef, add event batching middleware, and ensure proper cleanup of old handlers.
todos: []
---

# Fix Realtime Handler Closures and Channel Queue Overflow

## Problem Analysis

### Issue 1: Stale Handler Closures

- Handlers are recreated on every render when dependencies change
- Old handlers with stale closures remain in subscription registry's Set
- New handlers are added but old ones still execute with stale references
- Result: Realtime updates don't work because handlers reference old `debouncedFetchData` functions

### Issue 2: Channel Queue Overflow

- Events arrive faster than handlers can process them
- Each event triggers handler execution immediately
- Debouncing only delays API fetches, not handler execution
- Result: WebSocket channel queue fills up and stops processing updates

### Additional Critical Issues Found

#### Issue 3: No Cleanup Mechanism for `subscribeAllWorkspacesViaRegistry`

- Function returns `void` instead of cleanup function
- Cannot remove handlers when dependencies change
- **Fix**: Return cleanup function that removes all handlers for provided workspaceIds

#### Issue 4: Handler Reference Equality Prevents Cleanup

- Registry uses `Set<WorkspaceHandlers>` which compares by reference
- New handler objects don't match old ones for cleanup
- **Fix**: Use unique handler IDs for tracking and cleanup

#### Issue 5: Workspace List Changes Not Handled

- When workspaces array changes, old workspace subscriptions aren't cleaned up
- New workspaces are subscribed but removed ones remain subscribed
- **Fix**: Track previous workspaceIds and unsubscribe from removed workspaces

#### Issue 6: Nested Subscriptions with Stale Closures

- Nested subscriptions inside handlers (Home.tsx line 427) capture outer closures
- These also get stale when dependencies change
- **Fix**: Apply stable handler pattern to nested subscriptions

#### Issue 7: Event Batching Conflicts

- BoardPage already has batching for card/column color updates
- New batching might conflict or double-batch
- **Fix**: Integrate with existing batching or make it opt-in

#### Issue 8: Out-of-Order Events

- Events may arrive out of order
- Deduplication by timestamp might drop valid updates
- **Fix**: Use sequence numbers or smart event ordering logic

#### Issue 9: Memory Leaks from Pending Batches

- If component unmounts while events are batched, they may never process
- **Fix**: Process pending batches in cleanup function

#### Issue 10: Race Conditions in Handler Processing

- Handler set can change while events are being processed
- **Fix**: Snapshot handler set before processing

## Solution Architecture

### Approach

1. **Stable Handler References**: Use `useRef` to store handlers that don't change on every render
2. **Event Batching**: Batch multiple events before processing to reduce handler execution frequency
3. **Event Deduplication**: Drop stale events for the same entity if newer ones arrive
4. **Proper Cleanup**: Remove old handlers when dependencies change

## Implementation Plan

### Phase 1: Create Event Batching Utility

**File**: `src/realtime/eventBatcher.ts` (new file)Create a utility that batches events by entity type and processes them together:

```typescript
interface BatchedEvent<T> {
  entity: T;
  event: RealtimePostgresChangesPayload<Record<string, unknown>>;
  timestamp: number;
}

interface EventBatcherOptions {
  batchDelayMs?: number; // Default: 50ms
  maxBatchSize?: number; // Default: 100
  deduplicateBy?: (event: BatchedEvent<any>) => string; // Entity ID for deduplication
}

export function createEventBatcher<T>(
  handler: (events: BatchedEvent<T>[]) => void,
  options?: EventBatcherOptions
): (entity: T, event: RealtimePostgresChangesPayload<Record<string, unknown>>) => void
```

**Key Features**:

- Collects events in a buffer for `batchDelayMs`
- Processes batch when delay expires or `maxBatchSize` reached
- Deduplicates events: if multiple events for same entity, keep only the latest
- Handles out-of-order events using sequence numbers or `updatedAt` timestamps
- Processes pending batches on cleanup (unmount)
- Returns a handler function that can be used in subscriptions
- Returns cleanup function to process pending batches

**Implementation Details**:

```typescript
export function createEventBatcher<T>(
  handler: (events: BatchedEvent<T>[]) => void,
  options?: EventBatcherOptions
): {
  handler: (entity: T, event: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  cleanup: () => void; // Process pending batches
}
```

- Use `Map<string, BatchedEvent<T>>` for deduplication (keyed by entity ID)
- Track sequence numbers or use `updatedAt` for ordering
- Process batch immediately if `maxBatchSize` reached
- Schedule batch processing with `setTimeout`, clear on cleanup
- On cleanup, process any remaining events in buffer

### Phase 2: Create Stable Handler Hook

**File**: `src/hooks/useStableRealtimeHandlers.ts` (new file)Create a hook that wraps handlers with stable references and batching:

```typescript
export function useStableRealtimeHandlers<T extends WorkspaceHandlers>(
  handlers: T,
  dependencies: React.DependencyList
): T & { __handlerId?: string } // Include unique ID for registry tracking
```

**Key Features**:

- Uses `useRef` to store handlers
- Generates unique handler ID on first render (using `useMemo` or `useRef`)
- Updates ref when dependencies change
- Wraps handlers with event batching
- Returns stable handler object that doesn't change reference
- Includes cleanup function to process pending batches on unmount
- Handles out-of-order events by using sequence numbers or event ordering logic

### Phase 3: Update Subscription Registry

**File**: `src/realtime/subscriptionRegistry.ts`**Changes**:

1. Add handler ownership tracking with unique IDs
2. Modify `mergeHandlers` to support batched handlers
3. Add cleanup tracking to remove old handlers when new ones are added
4. Ensure handler sets are properly cleaned up
5. Lock handler set during processing to prevent race conditions

**Key Changes**:

- Add `handlerOwnership` Map to track which component owns which handlers (using unique IDs)
- Generate unique handler ID for each handler set registration
- Track handler cleanup functions in `subscribeWorkspace` with ownership ID
- When handlers are updated, remove old handlers by ownership ID before adding new ones
- Support batched handler execution in merged handlers
- Snapshot handler set before processing to prevent mid-execution changes

### Phase 4: Update Home.tsx

**File**: `src/pages/Home.tsx`**Changes**:

1. Import `useStableRealtimeHandlers` and `createEventBatcher`
2. Wrap handlers with `useStableRealtimeHandlers`
3. Add event batching for high-frequency events (board updates, member updates)
4. Track previous workspaceIds to handle workspace list changes
5. Apply stable handlers to nested subscriptions (line 427)
6. Add cleanup function to `useEffect` to remove handlers when dependencies change
7. Process pending batches on unmount

**Key Changes**:

```typescript
// Wrap handlers with stable references and batching
const stableHandlers = useStableRealtimeHandlers({
  onBoardUpdate: createEventBatcher((events) => {
    // Process batched board events
    // Deduplicate: keep only latest event per board ID
    // Process incremental updates first, then refetch if needed
  }, { batchDelayMs: 50, deduplicateBy: (e) => e.entity.id }),
  // ... other handlers
}, [debouncedFetchData, user, toast]);

// Track previous workspaceIds to detect changes
const prevWorkspaceIdsRef = useRef<string[]>([]);

useEffect(() => {
  if (!user || workspaces.length === 0) return;
  
  const workspaceIds = workspaces.map((w) => w.id);
  const prevWorkspaceIds = prevWorkspaceIdsRef.current;
  
  // Unsubscribe from removed workspaces
  const removedWorkspaceIds = prevWorkspaceIds.filter(id => !workspaceIds.includes(id));
  removedWorkspaceIds.forEach(id => {
    const registry = getSubscriptionRegistry();
    registry.unsubscribeWorkspace(id);
  });
  
  // Subscribe to new workspaces
  const cleanup = subscribeAllWorkspacesViaRegistry(workspaceIds, stableHandlers);
  
  prevWorkspaceIdsRef.current = workspaceIds;
  
  return () => {
    cleanup(); // Clean up handlers when dependencies change
    // Process any pending batches before cleanup
    // (handled by eventBatcher cleanup)
  };
}, [user, workspaces, stableHandlers]);
```

**Nested Subscription Fix** (line 427):

- Wrap nested subscription handlers with `useStableRealtimeHandlers` or use stable references
- Ensure nested handlers don't capture stale closures from outer scope

### Phase 5: Update BoardPage.tsx

**File**: `src/pages/BoardPage.tsx`**Changes**:

1. Import `useStableRealtimeHandlers` and `createEventBatcher`
2. Wrap handlers with `useStableRealtimeHandlers`
3. Integrate with existing card/column color batching (lines 675-898)
4. Add event batching for card/column updates (high frequency)
5. Add cleanup function to `useEffect`
6. Process pending batches on unmount

**Key Changes**:

- Similar pattern to Home.tsx
- Batch card updates (most frequent) - integrate with existing color batching
- Batch column updates - integrate with existing color batching
- Keep member updates batched but with shorter delay
- Ensure new batching doesn't conflict with existing `bufferedCardColorEventsRef` and `bufferedColumnColorEventsRef`
- Make batching opt-in or coordinate with existing batching logic

### Phase 6: Update Workspace Subscriptions

**File**: `src/realtime/workspaceSubscriptions.ts`**Changes**:

1. Make `subscribeAllWorkspacesViaRegistry` return cleanup function
2. Ensure handlers can accept batched event processors
3. No breaking changes to existing API

**Key Changes**:

- Change `subscribeAllWorkspacesViaRegistry` return type from `void` to `SubscriptionCleanup`
- Return cleanup function that removes all handlers for provided workspaceIds
- Track cleanup functions per workspaceId to enable proper cleanup

## Implementation Details

### Event Batching Strategy

1. **Board Updates**: Batch 50ms (adaptive: 16ms for simple property updates, 50ms for complex), deduplicate by board ID
2. **Card Updates**: Batch 16ms (1 frame), deduplicate by card ID, integrate with existing color batching
3. **Column Updates**: Batch 16ms, deduplicate by column ID, integrate with existing color batching
4. **Member Updates**: Batch 100ms, deduplicate by userId+boardId
5. **Workspace Updates**: No batching (low frequency)

### Deduplication Logic

When multiple events for the same entity arrive:

- Use event sequence numbers or `updatedAt` timestamps for ordering
- Handle out-of-order events: if older event arrives after newer, check if state has changed
- Keep the latest event (highest sequence/timestamp) that represents the most recent state
- Drop older events only if they don't represent intermediate states needed for correctness
- Process events in order when possible, or merge state changes intelligently

### Adaptive Batching

- Simple property updates (name, color): 16ms delay (near-instant)
- Complex updates (workspace moves, deletions): 50ms delay
- High-frequency updates (card moves): 16ms delay with max batch size of 50

### Handler Stability

- Handlers stored in `useRef` don't change reference
- Only the ref's `current` value updates
- Each handler set gets unique ID for registry tracking
- Subscription registry uses handler ID to match and remove old handlers
- Old handlers are properly removed via cleanup using ownership ID
- Handler object reference remains stable across renders

## Testing Checklist

- [ ] Realtime updates work after user changes
- [ ] Rapid events (100+ in quick succession) don't fill channel queue
- [ ] Handlers use latest dependencies (no stale closures)
- [ ] Event batching reduces handler execution frequency
- [ ] Deduplication prevents processing stale events
- [ ] Cleanup removes old handlers when dependencies change
- [ ] Incremental updates still work for simple changes
- [ ] Complex changes still trigger refetch
- [ ] Workspace list changes properly subscribe/unsubscribe
- [ ] Nested subscriptions use stable handlers
- [ ] Handler cleanup works when component unmounts
- [ ] Pending batches are processed on unmount
- [ ] Out-of-order events are handled correctly
- [ ] Existing card/column color batching still works
- [ ] Multiple components can subscribe to same workspace
- [ ] Handler reference equality works for cleanup
- [ ] No memory leaks from unprocessed batches
- [ ] Adaptive batching provides good UX (simple updates feel instant)

## Files Changed

- `src/realtime/eventBatcher.ts` (new)
- `src/hooks/useStableRealtimeHandlers.ts` (new)
- `src/realtime/subscriptionRegistry.ts` (modify - add handler ownership tracking, cleanup by ID)
- `src/pages/Home.tsx` (modify - workspace list change tracking, nested subscription fixes)
- `src/pages/BoardPage.tsx` (modify - integrate with existing batching, cleanup)
- `src/realtime/workspaceSubscriptions.ts` (modify - return cleanup from subscribeAllWorkspacesViaRegistry)

## Why This Works

1. **Stable References**: `useRef` ensures handlers don't change reference, preventing stale closures
2. **Handler Ownership IDs**: Unique IDs allow registry to track and remove specific handler sets
3. **Event Batching**: Reduces handler execution frequency, preventing queue overflow
4. **Workspace Change Tracking**: Properly subscribes/unsubscribes when workspace list changes
5. **Nested Handler Stability**: Nested subscriptions also use stable handlers, preventing closure issues
6. **Cleanup on Unmount**: Pending batches are processed, preventing memory leaks
7. **Out-of-Order Handling**: Sequence numbers or smart merging handle event ordering issues
8. **Adaptive Batching**: Simple updates feel instant, complex updates are batched appropriately
9. **Integration with Existing Batching**: Works with BoardPage's existing color batching logic

## Additional Edge Cases Handled

1. **Handler Reference Equality**: Uses unique IDs instead of reference equality for cleanup
2. **Race Conditions**: Snapshot handler set before processing to prevent mid-execution changes
3. **Memory Leaks**: Process pending batches on unmount, cleanup all handlers properly
4. **Workspace Removal**: Track previous workspaceIds and unsubscribe from removed workspaces
5. **Multiple Components**: Each component's handlers tracked separately via ownership IDs
6. **Nested Subscriptions**: Apply stable handler pattern to nested subscriptions too
7. **Event Ordering**: Handle out-of-order events intelligently using timestamps/sequence numbers
8. **Batching Conflicts**: Coordinate with existing batching logic in BoardPage