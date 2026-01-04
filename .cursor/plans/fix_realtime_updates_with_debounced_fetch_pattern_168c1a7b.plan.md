---
name: Fix Realtime Updates with Debounced Fetch Pattern
overview: "Replace fragile realtime update handlers with hybrid approach: incremental updates for simple changes, debounced silent refetch for complex changes. Fix race conditions, remove empty workspace deletion logic, and ensure board data updates work reliably with optimal performance."
todos: []
---

# Fix Realtime Up

dates with Hybrid Approach

## Implementation Todos

### Phase 1: Create Utilities

- [ ] Create `src/hooks/useDebouncedFetch.ts` with enhanced debouncing and batching
- [ ] Create `src/hooks/useBatchedStateUpdate.ts` for batching state updates
- [ ] Test utilities in isolation

### Phase 2: Home.tsx Updates

- [ ] Add `silentFetchData` function (fetchData without loading spinner)
- [ ] Create `debouncedFetchData` using `useSilentDebouncedFetch`
- [ ] Implement hybrid board INSERT handler (use silent refetch)
- [ ] Implement hybrid board UPDATE handler (incremental for simple, refetch for complex)
- [ ] Remove empty workspace deletion logic (lines 342-351, 409-418)
- [ ] Simplify board DELETE handler (use silent refetch)
- [ ] Simplify nested workspace subscription handlers
- [ ] Update member update handler (use silent refetch)
- [ ] Update workspace entity update handler (incremental for simple, refetch for delete)
- [ ] Update workspace membership handler (use silent refetch)
- [ ] Update useEffect dependencies

### Phase 3: BoardPage.tsx Updates

- [ ] Add `silentFetchBoardData` function (fetchBoardData without loading spinner)
- [ ] Create `debouncedFetchBoardData` using `useSilentDebouncedFetch`
- [ ] Create `debouncedRefreshBoardMembers` using `useSilentDebouncedFetch`
- [ ] Implement hybrid board UPDATE handler (incremental for name/color, refetch for unknown)
- [ ] Update member update handler (use debounced refresh)
- [ ] Update useEffect dependencies

### Phase 4: Testing

- [ ] Test board name/color updates (should be instant, no loading)
- [ ] Test board workspace moves (should use silent refetch)
- [ ] Test member additions/removals (should use silent refetch)