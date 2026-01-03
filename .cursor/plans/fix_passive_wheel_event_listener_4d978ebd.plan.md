---
name: Fix passive wheel event listener
overview: "Fix the passive event listener warning by replacing React's `onWheel` prop with a direct `addEventListener` call using `{ passive: false }` to allow `preventDefault()` to work properly."
todos: []
---

# Fix Passive Wheel Event Listener in KanbanColumn

## Problem

React's `onWheel` prop registers event listeners as passive by default for performance. This prevents `preventDefault()` from working, causing console warnings when trying to prevent scroll bounce at column boundaries.

## Solution

Replace the React `onWheel` prop with a direct DOM `addEventListener` call using `{ passive: false }`, following the same pattern used in `src/hooks/useDragScroll.ts`.

## Changes Required

1. **Update imports** in [`src/components/kanban/KanbanColumn.tsx`](src/components/kanban/KanbanColumn.tsx):

- Add `useEffect` to the React imports (line 1)

2. **Modify `handleWheel` callback** (lines 88-102):

- Change parameter type from `React.WheelEvent<HTMLDivElement>` to native `WheelEvent`
- Update property access to use native event properties (e.g., `e.deltaY` stays the same)

3. **Add `useEffect` hook** to attach the event listener:

- Attach `wheel` event listener using `addEventListener` with `{ passive: false }` option
- Clean up listener in the effect's return function
- Depend on `handleWheel` in the dependency array

4. **Remove `onWheel` prop** from JSX (line 252):