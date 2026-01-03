---
name: Remove Rate Limiting from Realtime Requests
overview: Remove rate limiting from all endpoints that trigger realtime events (boards, cards, columns, members, workspaces, labels, subtasks, permissions) while preserving rate limiting for read-only and non-realtime endpoints.
todos: []
---

#Remove Rate Limiting from Realtime Requests

## Current State

Rate limiting is implemented in [`backend/src/index.ts`](backend/src/index.ts) using `express-rate-limit` and applied to all `/api/` routes. There's already a `skip` function that attempts to exclude some realtime-related endpoints, but it's incomplete and misses many cases.

## Analysis

**Realtime events are triggered from:**

- Service methods that call `emitDatabaseChange()` or `emitCustomEvent()` from [`backend/src/realtime/emitter.ts`](backend/src/realtime/emitter.ts)
- These services are called by route handlers in:
- [`backend/src/routes/boards.ts`](backend/src/routes/boards.ts) - board operations, member operations
- [`backend/src/routes/cards.ts`](backend/src/routes/cards.ts) - card operations
- [`backend/src/routes/columns.ts`](backend/src/routes/columns.ts) - column operations
- [`backend/src/routes/labels.ts`](backend/src/routes/labels.ts) - label operations
- [`backend/src/routes/subtasks.ts`](backend/src/routes/subtasks.ts) - subtask operations
- [`backend/src/routes/members.ts`](backend/src/routes/members.ts) - board/workspace member operations
- [`backend/src/routes/workspaces.ts`](backend/src/routes/workspaces.ts) - workspace operations
- [`backend/src/routes/invites.ts`](backend/src/routes/invites.ts) - invite redemption (triggers member events)
- [`backend/src/routes/db.ts`](backend/src/routes/db.ts) - direct DB operations on permissions tables (custom_roles, role_permissions, board_member_custom_roles, profiles)

**WebSocket connections** are handled at `/realtime` (not `/api/realtime`), so they're already excluded from the `/api/` rate limiter.

## Implementation Plan

### 1. Update Rate Limiter Skip Logic

Modify the `skip` function in [`backend/src/index.ts`](backend/src/index.ts) to comprehensively exclude all write operations (POST, PATCH, DELETE) on realtime-related endpoints:**Exclude:**

- All POST/PATCH/DELETE on `/api/boards/*` (boards, members, columns, cards, labels, subtasks)
- All POST/PATCH/DELETE on `/api/cards/*`
- All POST/PATCH/DELETE on `/api/columns/*`
- All POST/PATCH/DELETE on `/api/labels/*`
- All POST/PATCH/DELETE on `/api/subtasks/*`
- All POST/PATCH/DELETE on `/api/members/*`
- All POST/PATCH/DELETE on `/api/workspaces/*`
- POST/PATCH/DELETE on `/api/db/*` for permissions-related tables (custom_roles, role_permissions, board_member_custom_roles, profiles)
- POST on `/api/invites/*` (invite redemption triggers realtime)
- WebSocket upgrade requests (already handled)

**Keep rate limiting for:**

- GET requests (read-only operations don't trigger realtime)
- Non-realtime endpoints (auth, app-settings, storage, admin, etc.)
- POST/PATCH/DELETE on non-realtime endpoints

### 2. Implementation Details

The skip function should check:

1. HTTP method (POST, PATCH, DELETE only)
2. Path patterns for realtime-related routes
3. For `/api/db/:table`, check if the table is permissions-related
4. WebSocket upgrade header (already present)

### 3. Validation

After implementation:

- Realtime updates should propagate instantly without throttling