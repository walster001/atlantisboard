# Per-user home board order

## Schema

Stored on the user document under `preferences`:

```typescript
preferences: {
  homeWorkspaceOrder?: string[]; // existing — workspace row order
  homeBoardOrderByWorkspace?: Record<string, string[]>; // workspaceId → ordered board ids
}
```

Mongoose: `homeBoardOrderByWorkspace` is a `Map` of `string[]` (workspace id → board id list).

## API

- **PUT** `/users/me/preferences` accepts optional:

```json
{
  "homeBoardOrderPatch": {
    "workspaceId": "<workspaceId>",
    "orderedBoardIds": ["<boardId>", "..."]
  }
}
```

Server validates that `orderedBoardIds` is exactly the set of boards the user can see in that workspace (same visibility rules as the home row).

- **PUT** `/boards/reorder` still exists and delegates to the same per-user preference save (no shared `Board.position` updates).

## Behaviour

| Action | Storage | Permission |
|--------|---------|------------|
| Reorder tiles within a workspace row | `preferences.homeBoardOrderByWorkspace[workspaceId]` | Any signed-in user who can see the row |
| Reorder workspace rows | `preferences.homeWorkspaceOrder` | Same as before |
| Move board to another workspace | `Board.workspaceId` | `workspaces.update`, workspace owner, or workspace admin/manager role |

Shared `Board.position` remains for listing defaults and legacy queries; home UI sort prefers per-user order when present.

## Removed

- Permission key `boards.reorder_in_home` (removed from built-in roles, catalog, board permission API list, and DB via startup `$pull`).
- Socket event `boards:positionsSynced` for home order (no longer emitted on reorder).

## Cleanup on workspace delete

`clearHomeBoardOrderForWorkspaceForAllUsers(workspaceId)` unsets `preferences.homeBoardOrderByWorkspace.<workspaceId>` on all users.

## Client

- `mergeBoardsWithHomeOrder` + `buildBoardsByWorkspaceSortedMap(allBoards, user.preferences.homeBoardOrderByWorkspace)`.
- Drag persist → `updateUserPreferences({ homeBoardOrderPatch })` then `refreshUser()`.

No data migration: existing users start with empty maps and fall back to `Board.position` / `createdAt` until they reorder.
