---
name: Fix WorkspaceId Cache Invalidation for Column Moves
overview: Fix workspaceId cache invalidation to prevent card_* table events from broadcasting to wrong workspace channels when columns are moved between boards. Ensures cache invalidation cascades properly to related entities.
todos:
  - id: phase1-1-add-cascade-invalidation-method
    content: "Phase 1.1: Add Cascade Invalidation Method - Create invalidateWorkspaceIdCacheCascade() method in realtime/server.ts, invalidate cards when column invalidated, invalidate columns and cards when board invalidated"
    status: completed
  - id: phase1-2-update-invalidation-logic
    content: "Phase 1.2: Update Invalidation Logic - Modify cache invalidation in emitDatabaseChange() to use cascade method, cascade to cards on column UPDATE, cascade to columns and cards on board UPDATE"
    status: completed
    dependencies:
      - phase1-1-add-cascade-invalidation-method
  - id: phase1-3-handle-edge-cases
    content: "Phase 1.3: Handle Edge Cases - Only cascade on UPDATE events that change boardId/workspaceId, skip cascade for other UPDATE events (title, color changes), optimize to only query if column/board actually moved"
    status: completed
    dependencies:
      - phase1-1-add-cascade-invalidation-method
      - phase1-2-update-invalidation-logic
  - id: phase2-1-add-cache-key-helpers
    content: "Phase 2.1: Add Cache Key Helpers - Create helper methods to generate cache keys consistently, support both entity-based keys (card:${id}) and relationship-based keys"
    status: completed
  - id: phase2-2-improve-cache-invalidation-granularity
    content: "Phase 2.2: Improve Cache Invalidation Granularity - Track which cards belong to which columns (optional optimization), only invalidate cards that actually need invalidation, consider maintaining reverse index columnId → cardIds[] (optional)"
    status: completed
    dependencies:
      - phase2-1-add-cache-key-helpers
  - id: phase3-1-add-cache-validation
    content: "Phase 3.1: Add Cache Validation - Before using cached workspaceId, verify it's still valid (optional), if card's column changed, invalidate cache entry, adds safety check but increases lookup cost"
    status: completed
    dependencies:
      - phase1-3-handle-edge-cases
  - id: test-column-move-scenarios
    content: Test column move scenarios - move column to different board, create attachment, verify correct workspace channel
    status: completed
    dependencies:
      - phase1-3-handle-edge-cases
  - id: test-board-move-scenarios
    content: Test board move scenarios - move board to different workspace, verify all column and card caches invalidated
    status: completed
    dependencies:
      - phase1-3-handle-edge-cases
  - id: test-edge-cases
    content: Test edge cases - rapid operations after move, near TTL expiry, multiple simultaneous moves
    status: completed
    dependencies:
      - phase1-3-handle-edge-cases
  - id: performance-testing
    content: Performance testing - measure cascade query impact, verify cache still provides benefits, test with large boards
    status: completed
    dependencies:
      - phase1-3-handle-edge-cases
---

# Fix Workspac

eId Cache Invalidation for Column MovesPlan to fix workspaceId cache invalidation issues that can cause card_* table events (attachments, subtasks) to broadcast to wrong workspace channels when columns are moved between boards.

## Problem Analysis

### Critical Issue

When a column is moved to a different board (different workspace):

1. Column cache is invalidated correctly
2. **Card caches in that column are NOT invalidated**
3. When an attachment/subtask is created on a card in the moved column, it uses stale cached workspaceId
4. Event broadcasts to wrong workspace channel for up to 30 seconds (cache TTL)

### Impact

- **Event Timing**: No delay - events broadcast immediately ✓
- **Event Content**: No change - payloads correct ✓
- **Channel Routing**: **WRONG** - events go to old workspace channel ✗
- **User Experience**: Users in new workspace don't see updates, users in old workspace see updates for cards they shouldn't see

## Solution Approach

### Option 1: Cascade Cache Invalidation (Recommended)

- When column is moved, invalidate all card caches in that column
- Requires querying cards in the column (one-time cost per move)
- Ensures correctness immediately

### Option 2: Shorter TTL for Card_* Operations

- Use 5-second TTL when resolving workspaceId for card_* tables
- Reduces stale data window but doesn't eliminate it
- Simpler but less robust

### Option 3: Always Fresh Lookup for Card_* Tables

- Skip cache entirely for card_* table events
- Always do fresh database lookup
- Most correct but higher database load

**Recommended: Option 1** - Best balance of correctness and performance

## Implementation Plan

### Phase 1: Enhance Cache Invalidation

**1.1 Add Cascade Invalidation Method**

- Create `invalidateWorkspaceIdCacheCascade()` method in `realtime/server.ts`
- When column is invalidated, also invalidate all cards in that column
- When board is invalidated, also invalidate all columns and cards in that board
- Query database to find related entities (one-time cost)

**1.2 Update Invalidation Logic**

- Modify cache invalidation in `emitDatabaseChange()` to use cascade method
- When column UPDATE detected, cascade to cards
- When board UPDATE detected, cascade to columns and cards

**1.3 Handle Edge Cases**

- Only cascade on UPDATE events that change boardId/workspaceId
- Skip cascade for other UPDATE events (title, color changes)
- Optimize: Only query if column/board actually moved

### Phase 2: Optimize Cache Lookups

**2.1 Add Cache Key Helpers**

- Create helper methods to generate cache keys consistently
- Support both entity-based keys (`card:${id}`) and relationship-based keys

**2.2 Improve Cache Invalidation Granularity**

- Track which cards belong to which columns (optional optimization)
- Only invalidate cards that actually need invalidation
- Consider maintaining reverse index: columnId → cardIds[] (optional)

### Phase 3: Add Safety Mechanisms

**3.1 Add Cache Validation**

- Before using cached workspaceId, verify it's still valid (optional)
- If card's column changed, invalidate cache entry
- Adds safety check but increases lookup cost

## Files to Modify

### Backend Files

1. **[backend/src/realtime/server.ts](backend/src/realtime/server.ts)**

- Add `invalidateWorkspaceIdCacheCascade()` method
- Update cache invalidation logic in `emitDatabaseChange()`
- Add helper methods for cache key generation

## Implementation Details

### Cache Invalidation Cascade Logic

```typescript
private async invalidateWorkspaceIdCacheCascade(
  entityType: 'board' | 'column' | 'card',
  entityId: string,
  record?: Record<string, unknown>
) {
  // Invalidate the entity itself
  this.invalidateWorkspaceIdCache(entityType, entityId);
  
  if (entityType === 'board') {
    // Invalidate all columns in this board
    const columns = await prisma.column.findMany({
      where: { boardId: entityId },
      select: { id: true },
    });
    columns.forEach(col => {
      this.invalidateWorkspaceIdCache('column', col.id);
    });
    
    // Invalidate all cards in this board (via columns)
    // Could optimize by querying cards directly with columnId IN (...)
  } else if (entityType === 'column') {
    // Invalidate all cards in this column
    const cards = await prisma.card.findMany({
      where: { columnId: entityId },
      select: { id: true },
    });
    cards.forEach(card => {
      this.invalidateWorkspaceIdCache('card', card.id);
    });
  }
  // Cards don't cascade to anything
}
```

### Detection of Column/Board Moves

```typescript
// In emitDatabaseChange(), detect if column/board actually moved
if (table === 'columns' && event === 'UPDATE' && newRecord && oldRecord) {
  const oldBoardId = (oldRecord as any)?.boardId;
  const newBoardId = (newRecord as any)?.boardId;
  if (oldBoardId !== newBoardId) {
    // Column moved to different board - cascade invalidate
    await this.invalidateWorkspaceIdCacheCascade('column', entityId, newRecord);
  }
}
```

## Performance Considerations

### Query Cost

- Column move: 1 query to find cards in column (typically < 100 cards)
- Board move: 1 query to find columns, then 1 query per column for cards
- Cost is one-time per move operation (rare operation)

### Cache Benefits Retained

- Most operations still benefit from cache (attachments, subtasks on unmoved cards)
- Only moved entities lose cache (expected behavior)
- Fresh lookups only for moved entities

## Success Criteria

- Column moved to different board → all card caches in that column invalidated
- Attachment created on card in moved column → broadcasts to correct workspace channel
- Board moved → all column and card caches invalidated
- No performance degradation for normal operations
- Cache still provides benefits for unmoved entities

## Migration Notes

- Backward compatible: Existing cache entries will expire naturally
- No breaking changes to event payloads or channels