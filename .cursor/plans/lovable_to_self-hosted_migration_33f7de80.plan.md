---
name: Lovable to Self-Hosted Migration
overview: Migrate from Supabase/Lovable cloud dependencies to a fully self-hosted Node.js/TypeScript backend with REST API, WebSocket realtime, JWT auth, Prisma ORM, and S3-compatible file storage while preserving the exact frontend structure and behavior.
todos:
  - id: phase1-auth
    content: "Phase 1: Implement backend foundation with JWT auth (email/password, Google OAuth, Google+MySQL verification), Prisma setup, and database schema migration"
    status: pending
  - id: phase2-api
    content: "Phase 2: Build REST API endpoints for all data models (workspaces, boards, columns, cards, labels, attachments, subtasks) matching Supabase client behavior"
    status: pending
    dependencies:
      - phase1-auth
  - id: phase3-permissions
    content: "Phase 3: Implement backend permission system with enforcement on all write/sensitive read operations, supporting app-level and board-level roles"
    status: pending
    dependencies:
      - phase2-api
  - id: phase4-realtime
    content: "Phase 4: Build WebSocket server for realtime updates, emit events on database changes, handle board member removal notifications"
    status: pending
    dependencies:
      - phase2-api
  - id: phase5-storage
    content: "Phase 5: Implement S3-compatible file storage (MinIO for local, configurable for production), migrate attachment uploads/downloads"
    status: pending
    dependencies:
      - phase2-api
  - id: phase6-functions
    content: "Phase 6: Migrate Supabase Edge Functions to REST endpoints (invite tokens, board import, MySQL config)"
    status: pending
    dependencies:
      - phase2-api
      - phase5-storage
  - id: phase7-deployment
    content: "Phase 7: Set up Docker Compose, Nginx configuration, environment variables, and deployment documentation"
    status: pending
    dependencies:
      - phase1-auth
      - phase2-api
      - phase4-realtime
      - phase5-storage
  - id: phase8-cleanup
    content: "Phase 8: Audit entire codebase, identify unused files and Supabase dependencies, create cleanup report for review"
    status: pending
    dependencies:
      - phase7-deployment
---

# Lovable to Self-

Hosted Backend Migration Plan

## Overview

This plan migrates the AtlantisBoard application from Supabase/Lovable cloud dependencies to a fully self-hosted backend. The frontend remains unchanged, consuming a new REST API that matches existing Supabase client behavior.

## Architecture

```javascript
┌─────────────┐
│   Frontend  │ (React/Vite - unchanged)
│  (Port 8080)│
└──────┬──────┘
       │ HTTP/WS
       ▼
┌─────────────────────────────────────┐
│      Nginx Reverse Proxy            │
│  (Routes /api/* and /ws/*)          │
└──────┬──────────────────┬───────────┘
       │                  │
       ▼                  ▼
┌─────────────┐    ┌──────────────┐
│  REST API   │    │ WebSocket    │
│ (Port 3000) │    │ Server       │
│             │    │ (Port 3001)  │
└──────┬──────┘    └──────┬───────┘
       │                  │
       └────────┬─────────┘
                ▼
         ┌──────────────┐
         │   Prisma     │
         │   ORM        │
         └──────┬───────┘
                ▼
         ┌──────────────┐
         │  PostgreSQL  │
         │  (Port 5432) │
         └──────────────┘
```



## Implementation Phases

### Phase 1: Backend Foundation & Auth

**Files to create:**

- `backend/package.json` - Node.js/TypeScript project setup
- `backend/tsconfig.json` - TypeScript configuration
- `backend/src/index.ts` - Express server entry point
- `backend/src/config/env.ts` - Environment variable management
- `backend/src/db/prisma/schema.prisma` - Prisma schema (mirror existing PostgreSQL schema)
- `backend/src/db/client.ts` - Prisma client initialization
- `backend/src/middleware/auth.ts` - JWT authentication middleware
- `backend/src/middleware/errorHandler.ts` - Error handling
- `backend/src/routes/auth.ts` - Auth endpoints (sign in, sign up, OAuth, refresh)
- `backend/src/services/auth.service.ts` - Auth business logic
- `backend/src/services/jwt.service.ts` - JWT token generation/validation
- `backend/src/services/password.service.ts` - Password hashing (bcrypt)
- `backend/src/services/oauth.service.ts` - Google OAuth integration
- `backend/src/services/mysql-verification.service.ts` - MySQL user verification

**Auth endpoints:**

- `POST /api/auth/signin` - Email/password sign in
- `POST /api/auth/signup` - Email/password sign up
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - Google OAuth callback
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/signout` - Sign out
- `POST /api/auth/verify-email` - Verify user email against MySQL (for google_verified mode)

**Database changes:**

- Add `users` table (replaces Supabase auth.users)
- Add `refresh_tokens` table for token management
- Migrate `profiles` table to reference new `users` table
- Update all foreign keys from `auth.users` to `users`

**Frontend changes:**

- Create `src/integrations/api/client.ts` - Replace Supabase client with fetch-based API client
- Update `src/hooks/useAuth.tsx` - Use new API endpoints instead of Supabase auth
- Keep same interface/behavior for components

### Phase 2: Core Data Models & REST API

**Files to create:**

- `backend/src/routes/workspaces.ts` - Workspace CRUD
- `backend/src/routes/boards.ts` - Board CRUD
- `backend/src/routes/columns.ts` - Column CRUD
- `backend/src/routes/cards.ts` - Card CRUD
- `backend/src/routes/labels.ts` - Label CRUD
- `backend/src/routes/attachments.ts` - Attachment management
- `backend/src/routes/subtasks.ts` - Subtask CRUD
- `backend/src/routes/members.ts` - Board/workspace member management
- `backend/src/services/workspace.service.ts`
- `backend/src/services/board.service.ts`
- `backend/src/services/column.service.ts`
- `backend/src/services/card.service.ts`
- `backend/src/services/label.service.ts`
- `backend/src/services/attachment.service.ts`
- `backend/src/services/subtask.service.ts`
- `backend/src/services/member.service.ts`

**API contract (matches Supabase client behavior):**

- `GET /api/workspaces` - List user's workspaces
- `POST /api/workspaces` - Create workspace
- `PATCH /api/workspaces/:id` - Update workspace
- `DELETE /api/workspaces/:id` - Delete workspace
- `GET /api/boards` - List boards (with filters)
- `POST /api/boards` - Create board
- `PATCH /api/boards/:id` - Update board
- `DELETE /api/boards/:id` - Delete board
- `GET /api/boards/:id/data` - Get full board data (replaces `get_board_data` function)
- Similar patterns for columns, cards, labels, etc.

**Frontend changes:**

- Create `src/integrations/api/database.ts` - API client wrapper that mimics Supabase `.from()` syntax
- Update all `supabase.from()` calls to use new API client
- Maintain same query syntax where possible (filters, selects, etc.)

### Phase 3: Permissions System

**Files to create:**

- `backend/src/lib/permissions/types.ts` - Permission key types (reuse from frontend)
- `backend/src/lib/permissions/registry.ts` - Role permission mappings
- `backend/src/lib/permissions/resolver.ts` - Backend permission checking
- `backend/src/middleware/permissions.ts` - Permission middleware for routes
- `backend/src/services/permission.service.ts` - Permission checking service

**Permission enforcement:**

- Every write endpoint checks permissions before allowing operation
- Sensitive read endpoints (e.g., board data, member lists) check permissions
- App-level permissions checked for admin routes
- Board-level permissions checked for board operations
- Custom roles supported via `custom_roles` and `role_permissions` tables

**Database functions to replace:**

- `has_permission()` - Backend service method
- `get_user_permissions()` - Backend service method
- `can_edit_board()` - Backend service method
- `can_manage_members()` - Backend service method
- `is_app_admin()` - Backend service method

**Frontend changes:**

- Keep frontend permission checks (display-only)
- Backend enforces all permissions

### Phase 4: Realtime WebSocket Server

**Files to create:**

- `backend/src/websocket/server.ts` - WebSocket server setup
- `backend/src/websocket/connection.ts` - Client connection management
- `backend/src/websocket/channels.ts` - Channel subscription system
- `backend/src/websocket/events.ts` - Event emission system
- `backend/src/services/realtime.service.ts` - Realtime event broadcasting

**WebSocket protocol:**

- Connect: `ws://localhost:3001` (or via Nginx proxy)
- Authenticate: Send JWT token in connection handshake
- Subscribe: `{ type: 'subscribe', channel: 'board:123', events: ['card.insert', 'card.update'] }`
- Events: `{ type: 'event', channel: 'board:123', event: 'card.insert', data: {...} }`
- Unsubscribe: `{ type: 'unsubscribe', channel: 'board:123' }`

**Event types (match Supabase realtime):**

- `card.insert`, `card.update`, `card.delete`
- `column.insert`, `column.update`, `column.delete`
- `board_member.insert`, `board_member.update`, `board_member.delete`
- `board_member.remove` - Special event when user removed from board

**Database triggers:**

- Create PostgreSQL triggers that emit events to WebSocket server
- Use `pg_notify` or direct connection from backend to PostgreSQL
- Alternative: Poll database changes (less efficient but simpler)

**Frontend changes:**

- Create `src/realtime/websocketClient.ts` - Replace Supabase realtime client
- Update `src/realtime/realtimeClient.ts` - Use WebSocket client
- Keep same subscription interface for components

### Phase 5: File Storage & Attachments

**Files to create:**

- `backend/src/services/storage.service.ts` - S3-compatible storage service
- `backend/src/routes/storage.ts` - File upload/download endpoints
- `backend/docker-compose.storage.yml` - MinIO setup for local dev
- `backend/src/config/storage.ts` - Storage configuration

**Storage buckets:**

- `card-attachments` - Card file attachments
- `branding` - App branding images (logos, backgrounds)

**Endpoints:**

- `POST /api/storage/:bucket/upload` - Upload file
- `GET /api/storage/:bucket/:path` - Download file (with auth check)
- `DELETE /api/storage/:bucket/:path` - Delete file

**Frontend changes:**

- Update `CardAttachmentSection.tsx` - Use new upload endpoint
- Update `BoardBackgroundSettings.tsx` - Use new upload endpoint
- Replace `supabase.storage` calls with API calls

### Phase 6: Edge Functions Migration

**Functions to migrate:**

- `generate-invite-token` → `POST /api/boards/:id/invites/generate`
- `redeem-invite-token` → `POST /api/invites/redeem`
- `verify-user-email` → `POST /api/auth/verify-email` (already in Phase 1)
- `import-wekan-board` → `POST /api/boards/import` (streaming SSE support)
- `save-mysql-config` → `POST /api/admin/mysql-config`
- `test-mysql-connection` → `POST /api/admin/mysql-config/test`

**Frontend changes:**

- Update `BoardImportDialog.tsx` - Use new import endpoint
- Update invite token generation/redemption - Use new endpoints
- Update admin MySQL config - Use new endpoints

### Phase 7: Environment & Deployment

**Files to create:**

- `backend/.env.example` - Environment variable template
- `backend/docker-compose.yml` - Backend services (API, WebSocket, MinIO)
- `docker/docker-compose.full.yml` - Full stack (frontend + backend + DB)
- `backend/Dockerfile` - Backend API Docker image
- `backend/websocket/Dockerfile` - WebSocket server Docker image
- `docker/nginx/nginx.conf` - Nginx config for API routing
- `backend/scripts/migrate-db.sh` - Database migration script

**Environment variables:**

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret
- `JWT_REFRESH_SECRET` - Refresh token secret
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `S3_ENDPOINT` - MinIO/AWS S3 endpoint
- `S3_ACCESS_KEY` - S3 access key
- `S3_SECRET_KEY` - S3 secret key
- `S3_BUCKET_PREFIX` - Bucket name prefix
- `MYSQL_ENCRYPTION_KEY` - MySQL config encryption key
- `API_PORT` - REST API port (default 3000)
- `WS_PORT` - WebSocket port (default 3001)

**Deployment:**

- Local dev: Docker Compose with hot reload
- Production: Nginx reverse proxy, separate containers for API/WS/DB

### Phase 8: Cleanup & Audit

**Tasks:**

1. Scan entire codebase for Supabase imports/references
2. Identify unused files (check imports, requires, dynamic imports)
3. Check for Supabase-specific code paths
4. Verify no Lovable SDK dependencies
5. Create cleanup report with:

- File paths
- Purpose/description
- Reason for being unused
- Verification method used

**Files likely to remove:**

- `src/integrations/supabase/` - Replace with API client
- `supabase/functions/` - Migrated to REST endpoints
- `supabase/migrations/` - Keep for reference, migrate to Prisma migrations
- Supabase-specific config files

## Key Implementation Details

### API Client Compatibility Layer

Create a compatibility layer that mimics Supabase client behavior:

```typescript
// src/integrations/api/database.ts
export class ApiClient {
  from(table: string) {
    return new TableQuery(table, this);
  }
}

// Usage: api.from('boards').select('*').eq('workspace_id', id)
```



### Permission Checking Pattern

Every write endpoint follows this pattern:

```typescript
// 1. Authenticate user (middleware)
// 2. Check permission
const hasPermission = await permissionService.check(
  userId,
  'board.edit',
  { boardId }
);
if (!hasPermission) throw new ForbiddenError();

// 3. Perform operation
// 4. Emit realtime event
```



### Realtime Event Emission

When database changes occur:

```typescript
// In service layer after DB operation
await realtimeService.emit({
  channel: `board:${boardId}`,
  event: 'card.insert',
  data: newCard
});
```



### Database Migration Strategy

1. Keep existing PostgreSQL database
2. Add new `users` table (don't delete Supabase auth.users yet)
3. Migrate data: Copy from `auth.users` to `users`
4. Update foreign keys gradually
5. Remove Supabase auth schema after migration complete

## Testing Strategy

1. **Unit tests**: Services, permission checks, utilities
2. **Integration tests**: API endpoints with test database
3. **E2E tests**: Critical user flows (auth, board creation, realtime)
4. **Migration tests**: Verify data integrity after migration