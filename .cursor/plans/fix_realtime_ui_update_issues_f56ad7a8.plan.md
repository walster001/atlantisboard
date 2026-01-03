---
name: Fix Realtime UI Update Issues
overview: "Fix board and workspace realtime updates not reflecting in the UI by: 1) merging UPDATE events with existing state instead of replacing, 2) handling workspace entity updates (not just membership), 3) adding workspace table subscription handler, 4) fixing column/card UPDATE handlers to merge state, and 5) adding card detail update handlers for attachments/subtasks."
todos:
  - id: fix-board-update-home
    content: "Fix board UPDATE handler in Home.tsx to merge state instead of replacing (2 locations: main handler and nested handler)"
    status: completed
  - id: add-table-to-payload
    content: Add table field to RealtimePostgresChangesPayload type and pass it through from WebSocket messages
    status: completed
  - id: add-workspace-table-handler
    content: Add workspace table (INSERT/UPDATE/DELETE) subscription handlers in workspaceSubscriptions.ts
    status: completed
    dependencies:
      - add-table-to-payload
  - id: fix-workspace-update-home
    content: Fix workspace UPDATE handler in Home.tsx to handle both workspace entity updates and membership updates
    status: completed
    dependencies:
      - add-workspace-table-handler
  - id: fix-column-update-boardpage
    content: Fix column UPDATE handler in BoardPage.tsx to merge state instead of replacing (line 583)
    status: completed
  - id: fix-card-update-boardpage
    content: Fix card UPDATE handler in BoardPage.tsx to merge state instead of replacing (line 769)
    status: completed
  - id: fix-buffered-card-update
    content: Fix buffered card UPDATE handler in processBufferedCardEvents to merge state instead of replacing (line 423)
    status: completed
  - id: add-card-detail-handler
    content: Add onCardDetailUpdate handler in BoardPage.tsx to handle attachments, subtasks, assignees, and labels updates
    status: completed
---

# Fix Realtime UI Update Issues

## Problem Analysis

Events are received via WebSocket but UI doesn't update because:

1. **UPDATE handlers replace entire objects** instead of merging with existing state, causing partial updates when payload is incomplete
2. **Workspace update handler only processes membership changes** (`workspaceMembers` table), not workspace entity updates (`workspaces` table)
3. **Missing subscription handler** for `workspaces` table updates in workspace subscriptions
4. **Column and card UPDATE handlers** in BoardPage.tsx replace entire objects instead of merging
5. **Missing onCardDetailUpdate handler** in BoardPage.tsx - card attachments, subtasks, assignees, and labels don't update in realtime

## Implementation Plan

### 1. Fix Board UPDATE Handler in Home.tsx

**File**: `src/pages/Home.tsx`**Location 1**: Main subscription handler (lines 321-325)

- Change from replacing entire board object to merging with existing state
- Use spread operator to merge `boardData` with existing board

**Location 2**: Nested subscription handler for dynamically added workspaces (lines 380-383)

- Apply same merge logic for consistency

**Code Pattern**:

```typescript
// Before:
prevBoards.map((b) => (b.id === boardData.id ? boardData : b))

// After:
prevBoards.map((b) => (b.id === boardData.id ? { ...b, ...boardData } : b))
```

### 2. Add Table Field to Payload Type

**File**: `src/realtime/realtimeClient.ts`**Location**: Line 19-24 (RealtimePostgresChangesPayload type)

**Issue**: The payload type doesn't include `table` field, but handlers need to distinguish between different tables (e.g., `workspaces` vs `workspaceMembers`).

**Change**: Add `table` field to the type:

```typescript
export type RealtimePostgresChangesPayload<T = Record<string, unknown>> = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string; // Add this field
  new: T | null;
  old: T | null;
  errors?: string[];
};
```

**File**: `src/integrations/api/realtime.ts`**Location**: Line 313-317 (processEventForChannel method)

**Change**: Pass `table` when calling handlers:

```typescript
// Before:
binding.handler({
  eventType: message.event,
  new: message.payload.new || null,
  old: message.payload.old || null,
});

// After:
binding.handler({
  eventType: message.event,
  table: message.table, // Add this
  new: message.payload.new || null,
  old: message.payload.old || null,
});
```

**Note**: The `table` field is already available in `message.table` (line 296), it just needs to be passed through to handlers.

### 3. Add Workspace Table Subscription Handler

**File**: `src/realtime/workspaceSubscriptions.ts`**Location**: After workspaceMembers handlers (around line 256)

Add handlers for `workspaces` table to catch workspace entity updates:

- INSERT event handler
- UPDATE event handler  
- DELETE event handler

These should call `handlers.onWorkspaceUpdate` with the workspace entity data, allowing the Home.tsx handler to process workspace name/description changes.

### 4. Fix Workspace UPDATE Handler in Home.tsx

**File**: `src/pages/Home.tsx`**Location**: Lines 357-447**Changes**:

- Check `event.table` to distinguish between `workspaces` (entity) and `workspaceMembers` (membership)
- For `workspaces` table updates: merge workspace state similar to board updates
- For `workspaceMembers` table updates: keep existing membership logic
- Remove early return that filters by `userId` for workspace entity updates

**Logic Flow**:

```typescript
if (event.table === 'workspaces') {
  // Handle workspace entity updates
  const workspaceEntity = workspace as Workspace;
  setWorkspaces((prev) => 
    prev.map((w) => w.id === workspaceEntity.id ? { ...w, ...workspaceEntity } : w)
  );
} else if (event.table === 'workspaceMembers') {
  // Handle membership updates (existing logic)
  // ... existing code
}
```

### 5. Fix Column UPDATE Handler in BoardPage.tsx

**File**: `src/pages/BoardPage.tsx`**Location**: Line 583 (inside `onColumnUpdate` handler)

**Current Issue**: Replaces entire column object instead of merging

**Change**:

```typescript
// Before:
const updated = prev.map((c) => (c.id === updatedColumn.id ? updatedColumn : c));

// After:
const updated = prev.map((c) => (c.id === updatedColumn.id ? { ...c, ...updatedColumn } : c));
```

**Important Notes**:

- This is inside the "Not a batched color update" branch. The merge should preserve existing fields while updating changed ones.
- **Position field preservation**: The merge will preserve the `position` field from `updatedColumn`, which is correct. The sorting that happens immediately after (line 584: `updated.sort((a, b) => a.position - b.position)`) will correctly reorder columns based on the updated position values.
- **Column movement**: When a column's position changes (moved left/right), the UPDATE event will include the new position, the merge will update it, and the sort will reorder the columns array correctly.

### 6. Fix Card UPDATE Handler in BoardPage.tsx

**File**: `src/pages/BoardPage.tsx`**Location**: Line 769 (inside `onCardUpdate` handler)

**Current Issue**: Replaces entire card object instead of merging

**Change**:

```typescript
// Before:
let updated = prev.map((c) => (c.id === updatedCard.id ? updatedCard : c));

// After:
let updated = prev.map((c) => (c.id === updatedCard.id ? { ...c, ...updatedCard } : c));
```

**Important Notes**:

- This is after conflict resolution logic, so the merge should work correctly with the timestamp-based conflict resolution already in place.
- **Position field preservation**: The merge will preserve both `position` and `columnId` fields from `updatedCard`. The sorting that happens immediately after (lines 773-778) will correctly reorder cards based on column and position.
- **Card movement scenarios**:
  - **Card moved within same column**: `position` changes, `columnId` stays same → merge updates position, sort reorders within column ✅
  - **Card moved to different column**: Both `columnId` and `position` change → merge updates both, sort moves card to correct column and position ✅
  - **Card moved to newly created column**: Event buffering handles this (see Section 6.1 below), then merge + sort works correctly ✅

### 7. Add Card Detail Update Handler in BoardPage.tsx

**File**: `src/pages/BoardPage.tsx`**Location**: Add after `onCardUpdate` handler (around line 808)

**Purpose**: Handle realtime updates for card attachments, subtasks, assignees, and labels

**Implementation**:

- Add `onCardDetailUpdate` handler to the workspace subscription
- Check `event.table` to determine which detail type (card_attachments, card_subtasks, card_assignees, card_labels) - now available after adding table to payload type (Section 2)
- Update corresponding state arrays:
  - `cardAttachments` for `card_attachments` table
  - `cardSubtasks` for `card_subtasks` table
  - Card assignees and labels if tracked in state

**Handler Structure**:

```typescript
onCardDetailUpdate: (detail, event) => {
  const detailData = detail as { cardId?: string; id?: string };
  
  // Only process if card belongs to current board
  const card = cards.find(c => c.id === detailData.cardId);
  if (!card || card.columnId && !columnIdsRef.current.includes(card.columnId)) {
    return;
  }
  
  if (event.table === 'card_attachments') {
    const attachment = detail as CardAttachment;
    if (event.eventType === 'INSERT') {
      setCardAttachments((prev) => {
        if (prev.some(a => a.id === attachment.id)) return prev;
        return [...prev, attachment];
      });
    } else if (event.eventType === 'UPDATE') {
      setCardAttachments((prev) =>
        prev.map((a) => a.id === attachment.id ? { ...a, ...attachment } : a)
      );
    } else if (event.eventType === 'DELETE') {
      setCardAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
    }
  } else if (event.table === 'card_subtasks') {
    const subtask = detail as CardSubtask;
    if (event.eventType === 'INSERT') {
      setCardSubtasks((prev) => {
        if (prev.some(s => s.id === subtask.id)) return prev;
        return [...prev, subtask];
      });
    } else if (event.eventType === 'UPDATE') {
      setCardSubtasks((prev) =>
        prev.map((s) => s.id === subtask.id ? { ...s, ...subtask } : s)
      );
    } else if (event.eventType === 'DELETE') {
      setCardSubtasks((prev) => prev.filter((s) => s.id !== subtask.id));
    }
  }
  // card_assignees and card_labels can be added if needed
}
```

**Note**: The handler should filter by `cardId` to only process details for cards in the current board. The state updates should merge for UPDATE events to preserve existing fields.

### 5.1. Fix Buffered Card Event Processing

**File**: `src/pages/BoardPage.tsx`**Location**: Line 423 (inside `processBufferedCardEvents` callback)

**Current Issue**: Buffered card UPDATE events also replace entire card object instead of merging

**Context**: When a card event arrives before its column exists, it's buffered (line 606-617). When the column is created, `processBufferedCardEvents()` is called (line 488) to process buffered events. The buffered UPDATE handler currently replaces the entire card.

**Change**:

```typescript
// Before (line 423):
let updated = prev.map((c) => (c.id === updatedCard.id ? updatedCard : c));

// After:
let updated = prev.map((c) => (c.id === updatedCard.id ? { ...c, ...updatedCard } : c));
```

**Verification of Event Buffering Logic with Merge Fix**:

1. **Scenario: Card moved to newly created column**

   - Column INSERT event arrives → column added to state → `processBufferedCardEvents()` called
   - Buffered card UPDATE event processed → merge preserves all fields including `columnId` and `position`
   - Sort reorders cards correctly based on new column and position ✅

2. **Scenario: New card in newly created column**

   - Column INSERT event arrives → column added → `processBufferedCardEvents()` called
   - Buffered card INSERT event processed → card added with correct `columnId` and `position`
   - Sort places card in correct position ✅

3. **Scenario: Multiple cards buffered for same column**

   - Column INSERT triggers processing of all buffered cards
   - Each card merge preserves position, final sort orders all correctly ✅

**Important**: The buffered event processing uses the same merge + sort pattern as the main handlers, ensuring consistency. The merge fix ensures that when buffered events are processed, all card fields (including position) are correctly preserved and applied.

## Testing Checklist

After implementation:

1. ✅ User A updates board name → User B sees update in realtime
2. ✅ User A updates workspace name → User B sees update in realtime  
3. ✅ User A updates column name/color → User B sees update in realtime
4. ✅ User A updates card title/description → User B sees update in realtime
5. ✅ User A adds/updates/deletes card attachment → User B sees update in realtime
6. ✅ User A adds/updates/deletes card subtask → User B sees update in realtime
7. ✅ **User A moves column (changes position) → User B sees column reordered in realtime**
8. ✅ **User A moves card within same column (changes position) → User B sees card reordered in realtime**
9. ✅ **User A moves card to different column → User B sees card moved to new column in realtime**
10. ✅ **User A creates new column, then moves card to it → User B sees card appear in new column (event buffering works)**
11. ✅ **User A creates new column with cards → User B sees column and cards appear correctly (event buffering works)**
12. ✅ No console errors during updates
13. ✅ State merges correctly (no missing fields after update)
14. ✅ Position fields preserved correctly after merge (columns and cards maintain correct order)

## Files to Modify

1. `src/realtime/realtimeClient.ts` - Add `table` field to RealtimePostgresChangesPayload type
2. `src/integrations/api/realtime.ts` - Pass `table` field when calling handlers
3. `src/realtime/workspaceSubscriptions.ts` - Add workspace table handlers
4. `src/pages/Home.tsx` - Fix board and workspace UPDATE handlers
5. `src/pages/BoardPage.tsx` - Fix column/card UPDATE handlers (main handlers + buffered event handler), add card detail update handler

## Implementation Notes

### Position Field Preservation

All UPDATE handlers that merge state will preserve position fields correctly:

- **Column position**: Merged `position` value is used by sort function (line 584) to reorder columns
- **Card position**: Merged `position` and `columnId` values are used by sort function (lines 773-778) to reorder cards
- The spread operator `{ ...existing, ...update }` ensures position fields from the update override existing values, which is the desired behavior

### Event Buffering Verification

The event buffering system works correctly with the merge fix:

- Cards are buffered when their column doesn't exist yet (race condition protection)
- When column is created, buffered events are processed using the same merge + sort pattern
- The merge fix ensures buffered card updates preserve all fields including position
- Sorting after merge ensures correct ordering regardless of event arrival order

### Movement Scenarios Covered

1. **Column movement**: UPDATE event includes new `position` → merge updates it → sort reorders ✅
2. **Card movement within column**: UPDATE event includes new `position` → merge updates it → sort reorders within column ✅
3. **Card movement between columns**: UPDATE event includes new `columnId` and `position` → merge updates both → sort moves card to correct location ✅
4. **Card to new column (buffered)**: Column INSERT triggers buffered card processing → merge preserves position → sort places correctly ✅