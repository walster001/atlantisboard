---
name: Remove Board Channel Backward Compatibility
overview: Eliminate backward compatibility code that emits events to board channels, migrate remaining custom events to workspace channels, and update access control logic to work with workspace channels.
todos: []
---

# Remove Board Channel Backward Compatibility

## Overview

Remove backward compatibility code that emits events to `board:{id}` channels. All frontend subscriptions use `workspace:{id}` channels, making board channel emissions unnecessary and wasteful.

## Current State

- Backend emits database change events to both `workspace:{id}` and `board:{id}` channels
- Two custom events still use board channels: `board.removed` (redundant) and `board.member.removed` (needs migration)
- Access control logic only works for board channels, not workspace channels
- Frontend only subscribes to workspace channels

## Changes Required

### 1. Remove Board Channel Emission from Database Changes

**File:** `backend/src/realtime/server.ts`Remove lines 705-709 that emit to board channels:

```typescript
// Remove these lines:
// Keep board channel for backward compatibility (temporary)
// TODO: Remove after full migration to workspace subscriptions
if (resolvedBoardId) {
  channels.push(`board:${resolvedBoardId}`);
}
```



### 2. Remove Redundant board.removed Custom Event

**File:** `backend/src/services/board.service.ts`Remove lines 484-487 (board channel emission). The workspace channel emission on lines 478-481 is sufficient:

```typescript
// Remove:
// Also emit to board channel (for clients currently viewing the board)
await emitCustomEvent(`board:${boardId}`, 'board.removed', {
  boardId,
});
```



### 3. Migrate board.member.removed to Workspace Channel

**File:** `backend/src/services/member.service.ts`Replace lines 347-351 to emit to workspace channel instead of board channel. Need to resolve workspaceId from boardId first:

```typescript
// Current:
await emitCustomEvent(`board:${boardId}`, 'board.member.removed', {
  userId: targetUserId,
  boardId,
});

// Replace with:
// Resolve workspaceId from board
const board = await prisma.board.findUnique({
  where: { id: boardId },
  select: { workspaceId: true },
});

if (board?.workspaceId) {
  await emitCustomEvent(`workspace:${board.workspaceId}`, 'board.member.removed', {
    userId: targetUserId,
    boardId,
    workspaceId: board.workspaceId,
  });
}
```



### 4. Update Access Control Logic for Workspace Channels

**File:** `backend/src/realtime/server.ts`Update `broadcast()` method (lines 327-365) to extract boardId from workspace events for access checking. Currently only checks board channels.**Current logic (lines 331-360):**

- Only extracts boardId from `board:{id}` channels
- Workspace channels bypass access checks

**Required changes:**

1. Extract boardId from event payload for workspace channels (payload contains `workspaceId` and entity metadata)
2. Perform access check for workspace channels when boardId is available in payload
3. Keep existing board channel logic for backward compatibility during transition (can remove later)

**Implementation approach:**

```typescript
// In broadcast() method, after line 332:
const boardId = this.extractUuidFromChannel(channel, 'board');

// Add logic to extract boardId from workspace channel events:
let boardIdForAccessCheck = boardId;
if (!boardIdForAccessCheck && channel.startsWith('workspace:')) {
  // Extract boardId from event payload for workspace channels
  // Payload contains entityType, parentId, workspaceId metadata
  if (event.payload?.parentId && event.payload?.entityType === 'board') {
    boardIdForAccessCheck = event.payload.parentId;
  } else if (event.table === 'boards' && event.payload?.new?.id) {
    boardIdForAccessCheck = event.payload.new.id;
  } else if (event.table === 'columns' && event.payload?.new?.boardId) {
    boardIdForAccessCheck = event.payload.new.boardId;
  } else if (event.table === 'cards' && event.payload?.new?.columnId) {
    // Need to resolve column -> board for cards
    // This is complex, may need to query or use cached workspaceId lookup
  }
}

// Update access check condition (line 344):
if (boardIdForAccessCheck && event.table !== 'boardMembers') {
  // ... existing access check logic
}
```

**Note:** Card events require column lookup to get boardId. Consider using the existing `resolveWorkspaceId` cache or adding a boardId cache.

### 5. Clean Up Comments and Dead Code

**File:** `backend/src/realtime/server.ts`

- Line 240: Remove or update comment about board channel permission checks
- Line 300: Update `extractUuidFromChannel` documentation to note it's primarily for workspace channels now
- Line 339: Update comment about board channel access checks to mention workspace channels

### 6. Update handleSubscribe Comment

**File:** `backend/src/realtime/server.ts`Line 240-242: Update comment since board channel subscription check is no longer relevant:

```typescript
// Current:
// Check board access for board channels
if (channel.startsWith('board:')) {
  // const _boardId = channel.substring(7); // Permission check will be done when emitting events
  // Permission check will be done when emitting events
  // For now, just allow subscription
}

// Update to:
// Access checks are performed during event broadcast, not during subscription
// This allows subscription but validates access when events are emitted
```



## Testing Considerations

1. **Verify workspace channel events still work:**

- Board updates appear on home page
- Column/card updates appear on board page
- Member updates work correctly

2. **Verify custom events:**

- `board.removed` still triggers (via workspace channel)
- `board.member.removed` still triggers (migrated to workspace channel)

3. **Verify access control:**

- Users without board access don't receive workspace channel events for that board
- Newly added members receive events correctly

4. **Performance:**

- No increase in WebSocket message volume
- Access checks still performant

## Risks

1. **Access control complexity:** Extracting boardId from workspace channel events may be complex for nested entities (cards require column lookup)
2. **Custom event handlers:** Verify no frontend code specifically listens for board channel custom events
3. **Timing:** Ensure workspaceId is available when emitting `board.member.removed` custom event

## Rollback Plan

If issues occur, revert changes in reverse order:

1. Restore board channel emissions in `emitDatabaseChange`
2. Restore custom event emissions to board channels