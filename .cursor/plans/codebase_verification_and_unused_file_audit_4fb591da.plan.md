---
name: Codebase Verification and Unused File Audit
overview: Comprehensive verification plan for the entire codebase to ensure all components work together, plus identification of unused/orphaned files that can be safely deleted after the Supabase to self-hosted backend migration.
todos: []
---

# Codebase Verification and Unused File Audit Plan

## Overview

This plan provides a systematic approach to verify all components of the migrated Kanban application and identify unused/orphaned files that can be safely removed after the Supabase to self-hosted backend migration.

## Phase 1: Full Integration Verification Checklist

### 1.1 Frontend Pages Verification

**Files to verify:**

- `src/pages/Home.tsx` - Dashboard with workspaces/boards
- `src/pages/BoardPage.tsx` - Main Kanban board view
- `src/pages/Auth.tsx` - Authentication (email/password, Google OAuth)
- `src/pages/InvitePage.tsx` - Board invite redemption
- `src/pages/AdminConfig.tsx` - Admin configuration panel
- `src/pages/Index.tsx` - Root redirect
- `src/pages/NotFound.tsx` - 404 page

**Verification steps:**

1. **Home Page:**

- [ ] Loads workspaces and boards correctly
- [ ] Create workspace functionality works
- [ ] Create board functionality works
- [ ] Delete workspace/board works
- [ ] Drag-and-drop board reordering works
- [ ] Move board between workspaces works
- [ ] Realtime updates for board membership changes
- [ ] Board import dialog opens and functions

2. **Board Page:**

- [ ] Loads board data (columns, cards, labels, members)
- [ ] Create/edit/delete columns works
- [ ] Create/edit/delete cards works
- [ ] Drag-and-drop cards between columns works
- [ ] Card color updates work
- [ ] Column color updates work
- [ ] Label management works
- [ ] Member management works
- [ ] Board settings modal works
- [ ] Realtime updates for all board changes
- [ ] Permission-based UI restrictions work

3. **Auth Page:**

- [ ] Email/password login works
- [ ] Email/password signup works
- [ ] Google OAuth login works
- [ ] Google OAuth with MySQL verification works
- [ ] Session refresh works
- [ ] Logout works
- [ ] Error handling displays correctly

4. **Invite Page:**

- [ ] Invite token redemption works
- [ ] Authentication redirect works
- [ ] Error states display correctly

5. **Admin Config:**

- [ ] App branding settings work
- [ ] Custom fonts settings work
- [ ] Login options settings work
- [ ] Permissions settings work
- [ ] MySQL verification settings work

### 1.2 Frontend Components Verification

**Key components to verify:**

- `src/components/kanban/*` - All Kanban board components
- `src/components/admin/*` - All admin components
- `src/components/import/*` - Board import components

**Verification steps:**

1. **Kanban Components:**

- [ ] `KanbanColumn.tsx` - Renders and updates correctly
- [ ] `KanbanCard.tsx` - Renders and updates correctly
- [ ] `CardDetailModal.tsx` - Opens and saves changes
- [ ] `CardAttachmentSection.tsx` - File upload/download works
- [ ] `CardSubtaskSection.tsx` - Subtask CRUD works
- [ ] `BoardLabelsSettings.tsx` - Label CRUD works
- [ ] `BoardMembersDialog.tsx` - Member management works
- [ ] `BoardSettingsModal.tsx` - Board settings save correctly
- [ ] `ThemeSettings.tsx` - Theme changes apply
- [ ] `BoardBackgroundSettings.tsx` - Background changes work

2. **Admin Components:**

- [ ] `AppBrandingSettings.tsx` - Logo uploads and settings save
- [ ] `CustomFontsSettings.tsx` - Font uploads work
- [ ] `LoginOptionsSettings.tsx` - Settings save correctly
- [ ] `permissions/*` - All permission components work

3. **Import Components:**

- [ ] `BoardImportDialog.tsx` - Wekan import works
- [ ] `InlineButtonIconDialog.tsx` - Icon handling works

### 1.3 Frontend Hooks Verification

**Hooks to verify:**

- `src/hooks/useAuth.tsx` - Authentication state management
- `src/hooks/useAppSettings.tsx` - App settings loading
- `src/hooks/usePermissions.tsx` - Permission checks
- `src/hooks/usePermissionsRealtime.tsx` - Realtime permission updates
- `src/hooks/useDragScroll.ts` - Drag scrolling works

**Verification steps:**

- [ ] `useAuth` - Session management, token refresh, logout
- [ ] `useAppSettings` - Settings load and refresh correctly
- [ ] `usePermissions` - Permission checks return correct values
- [ ] `usePermissionsRealtime` - Realtime updates trigger correctly

### 1.4 Frontend Realtime Verification

**Files to verify:**

- `src/realtime/realtimeClient.ts` - Realtime client implementation
- `src/realtime/boardSubscriptions.ts` - Board change subscriptions
- `src/realtime/homeSubscriptions.ts` - Home page subscriptions
- `src/realtime/permissionsSubscriptions.ts` - Permission subscriptions

**Verification steps:**

- [ ] WebSocket connection establishes
- [ ] Channel subscriptions work
- [ ] Board changes broadcast correctly
- [ ] Card moves broadcast correctly
- [ ] Member changes broadcast correctly
- [ ] Permission changes broadcast correctly
- [ ] Reconnection logic works
- [ ] Error handling works

### 1.5 Backend API Verification

**Routes to verify:**

- `backend/src/routes/auth.ts` - Authentication endpoints
- `backend/src/routes/boards.ts` - Board CRUD
- `backend/src/routes/cards.ts` - Card CRUD
- `backend/src/routes/columns.ts` - Column CRUD
- `backend/src/routes/labels.ts` - Label CRUD
- `backend/src/routes/members.ts` - Member management
- `backend/src/routes/home.ts` - Home data endpoint
- `backend/src/routes/rpc.ts` - RPC endpoints
- `backend/src/routes/storage.ts` - File storage
- `backend/src/routes/admin.ts` - Admin endpoints
- `backend/src/routes/app-settings.ts` - App settings
- `backend/src/routes/board-import.ts` - Board import
- `backend/src/routes/invites.ts` - Invite management

**Verification steps:**

1. **Auth Routes:**

- [ ] `POST /api/auth/signin` - Email/password login
- [ ] `POST /api/auth/signup` - Email/password signup
- [ ] `GET /api/auth/google` - Google OAuth redirect
- [ ] `POST /api/auth/google/callback` - Google OAuth callback
- [ ] `POST /api/auth/refresh` - Token refresh
- [ ] `POST /api/auth/signout` - Logout
- [ ] `GET /api/auth/me` - Current user

2. **Board Routes:**

- [ ] `GET /api/boards/:id` - Get board
- [ ] `POST /api/boards` - Create board
- [ ] `PATCH /api/boards/:id` - Update board
- [ ] `DELETE /api/boards/:id` - Delete board

3. **Card Routes:**

- [ ] `GET /api/cards/:id` - Get card
- [ ] `POST /api/cards` - Create card
- [ ] `PATCH /api/cards/:id` - Update card
- [ ] `DELETE /api/cards/:id` - Delete card

4. **RPC Routes:**

- [ ] `POST /api/rpc/get_home_data` - Home data
- [ ] `POST /api/rpc/get_board_data` - Board data
- [ ] `POST /api/rpc/get_board_member_profiles` - Board members
- [ ] `POST /api/rpc/batch_update_column_positions` - Column reorder
- [ ] `POST /api/rpc/batch_update_card_positions` - Card reorder
- [ ] `POST /api/rpc/batch_update_board_positions` - Board reorder
- [ ] `POST /api/rpc/move_board_to_workspace` - Move board
- [ ] `POST /api/rpc/update_card` - Update card
- [ ] `POST /api/rpc/get_board_deletion_counts` - Deletion counts
- [ ] `POST /api/rpc/get_workspace_deletion_counts` - Workspace counts

5. **Storage Routes:**

- [ ] `POST /api/storage/:bucket/upload` - File upload
- [ ] `GET /api/storage/:bucket/:path` - File download
- [ ] `DELETE /api/storage/:bucket/:path` - File delete
- [ ] `GET /api/storage/:bucket/:path/public-url` - Public URL

### 1.6 Backend Services Verification

**Services to verify:**

- All services in `backend/src/services/` directory
- Permission service integration
- Realtime event emission

**Verification steps:**

- [ ] All services handle errors correctly
- [ ] Permission checks are enforced
- [ ] Realtime events emit after database changes
- [ ] Transaction handling works correctly

### 1.7 Database Schema Verification

**Files to verify:**

- `backend/prisma/schema.prisma` - Prisma schema
- `backend/prisma/migrations/` - Database migrations

**Verification steps:**

- [ ] Prisma schema matches expected structure
- [ ] All migrations apply successfully
- [ ] Generated Prisma client is up to date
- [ ] Type safety is maintained

### 1.8 Type Safety Verification

**Verification steps:**

- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] No type errors in frontend
- [ ] No type errors in backend
- [ ] API contracts match between frontend and backend

## Phase 2: Dead/Unreferenced File Detection

### 2.1 Supabase Legacy Files

**Files to check for deletion:**

1. **Edge Functions (MIGRATED):**

- `supabase/functions/generate-invite-token/index.ts` → Migrated to `POST /api/invites/generate`
- `supabase/functions/redeem-invite-token/index.ts` → Migrated to `POST /api/invites/redeem`
- `supabase/functions/import-wekan-board/index.ts` → Migrated to `POST /api/boards/import`
- `supabase/functions/save-mysql-config/index.ts` → Migrated to `POST /api/admin/mysql-config`
- `supabase/functions/test-mysql-connection/index.ts` → Migrated to `POST /api/admin/mysql-config/test`
- `supabase/functions/verify-user-email/index.ts` → Migrated to `POST /api/auth/verify-email`
- `supabase/functions/index.ts` - Edge function index
- `supabase/functions/_shared/` - Shared edge function code

2. **Supabase Client Files (PARTIALLY USED):**

- `src/integrations/supabase/client.ts` - **KEEP FOR NOW** (used for types and some auth)
- `src/integrations/supabase/types.ts` - **KEEP FOR NOW** (used for type definitions)

3. **Supabase Docker Setup (POTENTIALLY UNUSED):**

- `supabase/docker/docker-compose.supabase.yml` - Supabase Docker Compose
- `supabase/docker/start-services.sh` - Supabase service startup
- `supabase/docker/generate-keys.sh` - Key generation
- `supabase/docker/create-auth-schema.sh` - Auth schema creation
- `supabase/docker/volumes/` - Supabase Docker volumes

4. **Supabase Migrations (KEEP FOR REFERENCE):**

- `supabase/migrations/` - **KEEP** (historical reference, schema documentation)

5. **Supabase Config (POTENTIALLY UNUSED):**

- `supabase/config.toml` - Supabase configuration (may be unused if not using Supabase locally)

### 2.2 Scripts and Deployment Files

**Files to check:**

1. **Supabase-specific scripts:**

- `scripts/encrypt-realtime-jwt-secret.py` - Supabase realtime JWT encryption
- `scripts/fix-realtime-tenant-connection.sh` - Supabase realtime fix
- `scripts/set-realtime-jwt-secret.sh` - Supabase realtime JWT setup
- `scripts/update-kong-keys.sh` - Supabase Kong API gateway keys

2. **Deployment scripts:**

- `atlantisboard_local_deploy.sh` - Check if still used
- `deploy-atlantisboard.sh` - Check if still used

### 2.3 Documentation Files

**Files to review:**

- `docs/SELF_HOSTING.md` - May reference Supabase setup
- `docs/LOCAL_DEVELOPMENT.md` - May reference Supabase setup
- `docs/SETUP_COMPLETE.md` - May be outdated

### 2.4 Unused Component Files

**Files to check:**

- `src/components/admin/BrandingSettings.tsx` - Check if duplicate of `AppBrandingSettings.tsx`
- Any test files that don't exist (no `.test.ts` or `.spec.ts` found)

### 2.5 Backend Documentation Files

**Files to review:**

- `backend/PHASE*_*.md` - Phase completion docs (may be kept for reference)
- `backend/Untitled` - Unnamed file, likely unused

## Phase 3: Detailed Deletion Report

### 3.1 High Priority Deletions (Safe to Delete)

**Edge Functions (All migrated to REST endpoints):**

```javascript
Priority: HIGH
Reason: All functionality migrated to REST endpoints
Files:
    - supabase/functions/generate-invite-token/index.ts
    - supabase/functions/redeem-invite-token/index.ts
    - supabase/functions/import-wekan-board/index.ts
    - supabase/functions/save-mysql-config/index.ts
    - supabase/functions/test-mysql-connection/index.ts
    - supabase/functions/verify-user-email/index.ts
    - supabase/functions/index.ts
    - supabase/functions/_shared/ (entire directory)
Verification: All endpoints have REST equivalents in backend/src/routes/
```

**Supabase-specific Scripts:**

```javascript
Priority: HIGH
Reason: No longer using Supabase realtime/Kong
Files:
    - scripts/encrypt-realtime-jwt-secret.py
    - scripts/fix-realtime-tenant-connection.sh
    - scripts/set-realtime-jwt-secret.sh
    - scripts/update-kong-keys.sh
Verification: No references to these scripts in codebase
```

**Unnamed/Untitled Files:**

```javascript
Priority: HIGH
Reason: Unnamed file, likely accidental
Files:
    - backend/Untitled
Verification: Check if file has any content or is empty
```



### 3.2 Medium Priority Deletions (Review Before Deleting)

**Supabase Docker Setup:**

```javascript
Priority: MEDIUM
Reason: May be used for local Supabase development
Files:
    - supabase/docker/docker-compose.supabase.yml
    - supabase/docker/start-services.sh
    - supabase/docker/generate-keys.sh
    - supabase/docker/create-auth-schema.sh
    - supabase/docker/volumes/ (entire directory)
Verification: Check if any documentation references these for local dev
Action: Archive or document if still needed for reference
```

**Supabase Config:**

```javascript
Priority: MEDIUM
Reason: May be used for local Supabase development
Files:
    - supabase/config.toml
Verification: Check if referenced in any setup scripts
Action: Keep if used for local Supabase, remove if not
```

**Deployment Scripts:**

```javascript
Priority: MEDIUM
Reason: May be outdated or replaced
Files:
    - atlantisboard_local_deploy.sh
    - deploy-atlantisboard.sh
Verification: Check if scripts are referenced in documentation
Action: Review and update or remove
```

**Duplicate Component:**

```javascript
Priority: MEDIUM
Reason: Potential duplicate
Files:
    - src/components/admin/BrandingSettings.tsx
Verification: Compare with AppBrandingSettings.tsx, check imports
Action: Remove if duplicate, merge if different
```



### 3.3 Low Priority / Keep for Reference

**Supabase Migrations:**

```javascript
Priority: LOW
Reason: Historical reference, schema documentation
Files:
    - supabase/migrations/ (entire directory)
Action: KEEP - Useful for understanding schema evolution
```

**Supabase Client Files:**

```javascript
Priority: LOW
Reason: Still used for type definitions
Files:
    - src/integrations/supabase/client.ts
    - src/integrations/supabase/types.ts
Action: KEEP FOR NOW - Remove after generating Prisma types
```

**Phase Documentation:**

```javascript
Priority: LOW
Reason: Migration documentation
Files:
    - backend/PHASE*_*.md (all phase documentation)
Action: KEEP - Useful for understanding migration process
```



## Phase 4: Automated Deletion Instructions (Cursor-Ready)

### 4.1 High Priority Deletions Script

```bash
# Delete migrated edge functions
rm -rf supabase/functions/generate-invite-token
rm -rf supabase/functions/redeem-invite-token
rm -rf supabase/functions/import-wekan-board
rm -rf supabase/functions/save-mysql-config
rm -rf supabase/functions/test-mysql-connection
rm -rf supabase/functions/verify-user-email
rm -f supabase/functions/index.ts
rm -rf supabase/functions/_shared

# Delete Supabase-specific scripts
rm -f scripts/encrypt-realtime-jwt-secret.py
rm -f scripts/fix-realtime-tenant-connection.sh
rm -f scripts/set-realtime-jwt-secret.sh
rm -f scripts/update-kong-keys.sh

# Delete unnamed file
rm -f backend/Untitled
```



### 4.2 Verification Before Deletion

**Before running deletion script, verify:**

1. All edge functions have REST equivalents
2. No scripts reference the files to be deleted
3. No imports reference the files to be deleted
4. Documentation doesn't reference the files

**Verification commands:**

```bash
# Check for references to edge functions
grep -r "generate-invite-token\|redeem-invite-token\|import-wekan-board" src/ backend/

# Check for references to scripts
grep -r "encrypt-realtime-jwt-secret\|fix-realtime-tenant-connection" scripts/ docs/

# Check for imports of deleted files
grep -r "from.*supabase/functions" src/
```



## Phase 5: Testing and Verification Plan

### 5.1 Local Development Setup

**Steps:**

1. Start backend: `cd backend && npm run dev`
2. Start frontend: `npm run dev`
3. Start PostgreSQL: `docker-compose -f backend/docker-compose.yml up -d`
4. Start MinIO: Included in backend docker-compose
5. Run migrations: `cd backend && ./scripts/migrate-db.sh`

### 5.2 Manual Testing Checklist

**Authentication:**

- [ ] Email/password signup
- [ ] Email/password login
- [ ] Google OAuth login
- [ ] Session refresh
- [ ] Logout

**Board Operations:**

- [ ] Create board
- [ ] Edit board
- [ ] Delete board
- [ ] Move board between workspaces
- [ ] Reorder boards

**Card Operations:**

- [ ] Create card
- [ ] Edit card
- [ ] Delete card
- [ ] Move card between columns
- [ ] Update card color
- [ ] Add/remove labels
- [ ] Add/remove attachments
- [ ] Add/remove subtasks

**Realtime:**

- [ ] Open board in two browsers
- [ ] Make changes in one browser
- [ ] Verify changes appear in other browser
- [ ] Test reconnection after disconnect

**File Storage:**

- [ ] Upload card attachment
- [ ] Download card attachment
- [ ] Delete card attachment
- [ ] Upload branding logo
- [ ] Upload custom font

### 5.3 Automated Testing (Future)

**Recommended tests to add:**

- Unit tests for services
- Integration tests for API routes
- E2E tests for critical flows
- Type checking in CI/CD

## Phase 6: Final Verification Report Template

**Report structure:**

```javascript
# Codebase Verification Report

## Date: [DATE]

## Verification Status
- [ ] Frontend pages verified
- [ ] Frontend components verified
- [ ] Backend APIs verified
- [ ] Realtime functionality verified
- [ ] File storage verified
- [ ] Type safety verified

## Files Deleted
[List of deleted files with reasons]

## Files Kept (with reasons)
[List of kept files that were reviewed]

## Issues Found
[List any issues found during verification]

## Recommendations
[Any recommendations for improvements]
```



## Success Criteria

- [ ] All frontend pages render and function correctly
- [ ] All backend APIs respond correctly