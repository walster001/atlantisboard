---
name: Supabase Dependency Removal
overview: Complete removal of all Supabase dependencies by migrating remaining auth/storage/rpc usage to API client, removing unused imports, archiving edge functions, and generating Prisma types to replace Supabase types.
todos:
  - id: migrate-board-import-dialog
    content: "Complete BoardImportDialog.tsx migration: Replace supabase.auth.getUser() with useAuth hook (line 541), replace supabase.from('board_members').insert() with api.from() (line 591), remove supabase import"
    status: pending
  - id: migrate-auth-rpc
    content: "Migrate Auth.tsx RPC call: Replace supabase.rpc('get_auth_page_data') with GET /api/app-settings endpoint (line 86), update response type handling, remove supabase import"
    status: pending
  - id: migrate-storage-custom-fonts
    content: "Migrate CustomFontsSettings.tsx storage operations: Replace supabase.storage with api.storage for upload, getPublicUrl, and remove operations, remove supabase import"
    status: pending
  - id: migrate-storage-board-background
    content: "Migrate BoardBackgroundSettings.tsx storage operations: Replace supabase.storage with api.storage for upload and getPublicUrl operations, remove supabase import"
    status: pending
  - id: migrate-storage-inline-button
    content: "Migrate InlineButtonEditor.tsx storage operations: Replace supabase.storage with api.storage for upload and getPublicUrl operations, remove supabase import"
    status: pending
  - id: migrate-auth-session-check
    content: "Migrate LoginOptionsSettings.tsx: Replace supabase.auth.getSession() with api.auth.getSession() (line 221), remove supabase import"
    status: pending
  - id: verify-unused-imports
    content: "Verify and remove unused Supabase imports from 9 files: ThemeSettings, ThemeEditorModal, CardSubtaskSection, BoardMemberAuditLog, InlineButtonIconDialog, PermissionsSettings, AppAdminUserList, testing.ts, runTests.ts"
    status: pending
    dependencies:
      - migrate-storage-inline-button
  - id: generate-prisma-types
    content: "Generate Prisma client types: Ensure schema is up-to-date in backend/prisma/schema.prisma, run npx prisma generate, create backend/src/types/prisma.ts to export types for frontend use"
    status: pending
  - id: replace-supabase-types
    content: "Replace Supabase types with Prisma types: Update realtime subscriptions (homeSubscriptions, boardSubscriptions, permissionsSubscriptions) to use WebSocket event types, replace Database type in usePermissionsData.ts with Prisma types"
    status: pending
    dependencies:
      - generate-prisma-types
  - id: archive-edge-functions
    content: "Archive edge functions directory: Create supabase/functions.archived/, move functions directory, create README.md with migration mapping documentation (6 functions mapped to REST endpoints)"
    status: pending
  - id: remove-supabase-package
    content: "Remove Supabase package: Verify all direct supabase client usage removed (grep search), verify all imports removed/migrated, check if types still needed, run npm uninstall @supabase/supabase-js if types replaced"
    status: pending
    dependencies:
      - migrate-board-import-dialog
      - migrate-auth-rpc
      - migrate-storage-custom-fonts
      - migrate-storage-board-background
      - migrate-storage-inline-button
      - migrate-auth-session-check
      - verify-unused-imports
      - replace-supabase-types
  - id: comprehensive-testing
    content: "Comprehensive functionality testing: Test authentication (sign up/in, OAuth, session, token refresh), board operations (create/view/edit/delete, members, labels, themes), card operations (create/edit/move/delete, attachments, subtasks), home dashboard (workspaces, boards), admin features, import/export, storage operations, realtime updates"
    status: pending
    dependencies:
      - migrate-board-import-dialog
      - migrate-auth-rpc
      - migrate-storage-custom-fonts
      - migrate-storage-board-background
      - migrate-storage-inline-button
      - migrate-auth-session-check
  - id: type-safety-verification
    content: "Type safety verification: Run npm run build, check for type errors, verify all any types resolved where possible, ensure Prisma types used correctly"
    status: pending
    dependencies:
      - replace-supabase-types
  - id: regression-testing
    content: "Regression testing: Test critical user flows (registration→board creation→card operations, board import→member addition→permissions, admin settings→font upload→customization), verify no functionality regressed, check browser console for errors"
    status: pending
    dependencies:
      - comprehensive-testing
---

#Supabase Dependency Removal - Comprehensive Remediation Plan

## Overview

This plan addresses all outstanding Supabase dependencies identified in `backend/PHASE8_VERIFICATION_REPORT.md`. The goal is to complete the migration to the self-hosted backend by removing all direct Supabase client usage, archiving obsolete files, and preparing for package removal.

## Current State

- **Database queries**: 89% migrated (8/9 files)
- **Auth/storage/rpc**: 0% migrated (5 confirmed files)
- **Unused imports**: 10 files need verification
- **Edge functions**: Not archived (all migrated to REST)
- **Package**: Still in `package.json` (needed for types)

## Phase 1: High Priority Migrations (Critical Functionality)

### Task 1.1: Complete BoardImportDialog.tsx Migration

**File**: `src/components/import/BoardImportDialog.tsx`**Priority**: HIGH**Status**: Partially migrated (1 `supabase.from()` + 1 `supabase.auth.getUser()` remaining)**Actions**:

1. Replace `supabase.auth.getUser()` on line 541 with `useAuth` hook:
   ```typescript
                              // Before:
                              const { data: { user } } = await supabase.auth.getUser();
                              
                              // After:
                              const { user } = useAuth();
                              if (!user) { ... }
   ```




2. Replace `supabase.from('board_members').insert()` on line 591 with `api.from()`:
   ```typescript
                              // Before:
                              await supabase.from('board_members').insert({...});
                              
                              // After:
                              await api.from('board_members').insert({...});
   ```




3. Remove `supabase` import if no longer used
4. Add `useAuth` import if not already present

**Verification**:

- [ ] Board import (Wekan/Trello) works correctly
- [ ] User is properly authenticated during import
- [ ] Board members are created successfully

---

### Task 1.2: Migrate Auth.tsx RPC Call

**File**: `src/pages/Auth.tsx`**Priority**: HIGH**Status**: Uses `supabase.rpc('get_auth_page_data')`**Actions**:

1. Replace `supabase.rpc('get_auth_page_data')` on line 86 with REST endpoint:
   ```typescript
                              // Before:
                              const { data, error } = await supabase.rpc('get_auth_page_data');
                              
                              // After:
                              const response = await fetch(`${api.baseUrl}/app-settings`);
                              const { data, error } = await response.json();
                              // Or use api.request() if available
   ```




2. Update response type handling to match `/api/app-settings` response structure
3. Remove `supabase` import

**Backend Note**: The `/api/app-settings` endpoint already exists and returns the required data structure (settings + fonts).**Verification**:

- [ ] Auth page loads with correct branding settings
- [ ] Custom fonts are displayed
- [ ] Login/register forms render correctly

---

## Phase 2: Medium Priority Migrations (Components & Hooks)

### Task 2.1: Migrate Storage Operations

**Files**:

- `src/components/admin/CustomFontsSettings.tsx`
- `src/components/kanban/BoardBackgroundSettings.tsx`
- `src/components/kanban/InlineButtonEditor.tsx`

**Priority**: MEDIUM**Status**: Use `supabase.storage` for file uploads/downloads**Actions** (for each file):

1. Replace `supabase.storage.from(bucket)` with `api.storage.from(bucket)`
2. Update upload calls:
   ```typescript
                              // Before:
                              const { error } = await supabase.storage.from('fonts').upload(fileName, file);
                              
                              // After:
                              const { error } = await api.storage.from('fonts').upload(fileName, file);
   ```




3. Update `getPublicUrl()` calls:
   ```typescript
                              // Before:
                              const { data: urlData } = supabase.storage.from('fonts').getPublicUrl(fileName);
                              
                              // After:
                              const { data: urlData } = api.storage.from('fonts').getPublicUrl(fileName);
   ```




4. Update `remove()` calls:
   ```typescript
                              // Before:
                              await supabase.storage.from('fonts').remove([fileName]);
                              
                              // After:
                              await api.storage.from('fonts').remove([fileName]);
   ```




5. Remove `supabase` imports

**Verification**:

- [ ] Font uploads work in CustomFontsSettings
- [ ] Font deletion works
- [ ] Board background image uploads work
- [ ] Inline button icon uploads work
- [ ] Public URLs are generated correctly

---

### Task 2.2: Migrate Auth Session Check

**File**: `src/components/admin/LoginOptionsSettings.tsx`**Priority**: MEDIUM**Status**: Uses `supabase.auth.getSession()`**Actions**:

1. Replace `supabase.auth.getSession()` on line 221 with `api.auth.getSession()`:
   ```typescript
                              // Before:
                              const { data: { session } } = await supabase.auth.getSession();
                              
                              // After:
                              const { data: { session } } = await api.auth.getSession();
   ```




2. Remove `supabase` import

**Verification**:

- [ ] MySQL connection test works
- [ ] Session is properly retrieved
- [ ] Admin authentication check works

---

## Phase 3: Low Priority Cleanup (Unused Imports & Verification)

### Task 3.1: Verify and Remove Unused Supabase Imports

**Files to verify**:

1. `src/components/kanban/ThemeSettings.tsx`
2. `src/components/kanban/ThemeEditorModal.tsx`
3. `src/components/kanban/CardSubtaskSection.tsx`
4. `src/components/kanban/BoardMemberAuditLog.tsx`
5. `src/components/import/InlineButtonIconDialog.tsx`
6. `src/components/admin/permissions/PermissionsSettings.tsx`
7. `src/components/admin/permissions/AppAdminUserList.tsx`
8. `src/lib/permissions/testing.ts`
9. `src/lib/permissions/runTests.ts`

**Priority**: LOW**Actions**:

1. For each file, search for actual `supabase.` usage (not just imports)
2. If no usage found:

- Remove `import { supabase } from '@/integrations/supabase/client';`
- Verify file still compiles

3. If usage found:

- Document the usage pattern
- Add to migration queue if needed

**Verification**:

- [ ] All files compile without errors
- [ ] No runtime errors from missing imports
- [ ] Functionality remains intact

---

## Phase 4: Prisma Type Generation & Type Migration

### Task 4.1: Generate Prisma Client Types

**Priority**: MEDIUM**Actions**:

1. Ensure Prisma schema is up-to-date in `backend/prisma/schema.prisma`
2. Run Prisma generate in WSL:
   ```bash
                              cd backend
                              npx prisma generate
   ```




3. Export Prisma types for frontend use:

- Create `backend/src/types/prisma.ts` that exports Prisma types
- Or use Prisma's JSON schema export feature

**Verification**:

- [ ] Prisma client types are generated
- [ ] Types match database schema

---

### Task 4.2: Replace Supabase Types with Prisma Types

**Files using Supabase types**:

- `src/realtime/homeSubscriptions.ts` - `RealtimePostgresChangesPayload`
- `src/realtime/boardSubscriptions.ts` - `RealtimePostgresChangesPayload`
- `src/realtime/permissionsSubscriptions.ts` - `RealtimePostgresChangesPayload`
- `src/components/admin/permissions/usePermissionsData.ts` - `Database` type

**Priority**: LOW**Actions**:

1. Use existing Websocket event types for realtime payloads
2. Replace `Database` type with Prisma-generated types where applicable
3. Generate prisma equivalents for all current supabase types

**Note**: Realtime payload types may need to remain as-is if they're specific to the WebSocket event structure.**Verification**:

- [ ] TypeScript compilation succeeds
- [ ] No type errors in realtime subscriptions
- [ ] Type safety maintained

---

## Phase 5: Archive & Cleanup

### Task 5.1: Archive Edge Functions Directory

**Directory**: `supabase/functions/`**Priority**: LOW**Status**: All 6 functions migrated to REST endpoints**Actions**:

1. Create archive directory: `supabase/functions.archived/`
2. Move entire `supabase/functions/` directory to archive
3. Create `supabase/functions.archived/README.md` documenting:

- Migration mapping (function → REST endpoint)
- Date archived
- Reason for archiving

**Migration Mapping**:

- `generate-invite-token` → `POST /api/boards/:id/invites/generate`
- `redeem-invite-token` → `POST /api/invites/redeem`
- `import-wekan-board` → `POST /api/boards/import`
- `save-mysql-config` → `POST /api/admin/mysql-config`
- `test-mysql-connection` → `POST /api/admin/mysql-config/test`
- `verify-user-email` → `POST /api/auth/verify-email`

**Verification**:

- [ ] Directory moved successfully
- [ ] Documentation created
- [ ] No references to functions directory in code

---

### Task 5.2: Remove Supabase Package (Final Step)

**File**: `package.json`**Priority**: LOW (after all migrations complete)**Status**: Still needed for types and compatibility**Actions**:

1. Verify all direct `supabase` client usage is removed (grep search)
2. Verify all imports are removed or migrated
3. Check if types are still needed:

- If Prisma types replace all Supabase types → remove package
- If realtime types still needed → keep package temporarily

4. Remove package:
   ```bash
                              npm uninstall @supabase/supabase-js
   ```




5. Update `package-lock.json` automatically

**Verification**:

- [ ] No compilation errors
- [ ] No runtime errors
- [ ] All functionality works

---

## Phase 6: Verification & Testing

### Task 6.1: Comprehensive Functionality Testing

**Priority**: HIGH**Test Checklist**:

#### Authentication & Authorization

- [ ] Email/password sign up
- [ ] Email/password sign in
- [ ] Google OAuth sign in
- [ ] Session persistence
- [ ] Sign out
- [ ] Token refresh
- [ ] Admin access checks

#### Board Operations

- [ ] Create board
- [ ] View board (BoardPage)
- [ ] Edit board settings
- [ ] Delete board
- [ ] Board member management
- [ ] Board labels
- [ ] Board themes

#### Card Operations

- [ ] Create card
- [ ] Edit card
- [ ] Move card between columns
- [ ] Delete card
- [ ] Card attachments
- [ ] Card subtasks

#### Home Dashboard

- [ ] Workspace listing
- [ ] Board listing
- [ ] Create workspace
- [ ] Delete workspace

#### Admin Features

- [ ] App branding settings
- [ ] Custom fonts management
- [ ] MySQL configuration
- [ ] Permissions management
- [ ] User management

#### Import/Export

- [ ] Wekan board import
- [ ] Trello board import
- [ ] Board import with inline buttons

#### Storage Operations

- [ ] Font file upload
- [ ] Font file deletion
- [ ] Board background image upload
- [ ] Inline button icon upload
- [ ] Public URL generation

#### Realtime Updates

- [ ] Board changes (columns, cards)
- [ ] Home changes (workspaces, boards)
- [ ] Permissions changes
- [ ] Member changes

---

### Task 6.2: Type Safety Verification

**Priority**: MEDIUM**Actions**:

1. Run TypeScript compiler:
   ```bash
                              npm run build
   ```




2. Check for any type errors
3. Verify all `any` types are resolved where possible
4. Ensure Prisma types are used correctly

**Verification**:

- [ ] No TypeScript errors
- [ ] No type warnings
- [ ] All types are properly defined

---

### Task 6.3: Regression Testing

**Priority**: HIGH**Actions**:

1. Test all critical user flows
2. Verify no functionality regressed
3. Check browser console for errors
4. Verify network requests are correct

**Critical Flows**:

- User registration → Board creation → Card operations
- Board import → Member addition → Permissions
- Admin settings → Font upload → Board customization

---

## Implementation Order

1. **Phase 1** (High Priority) - Complete critical migrations
2. **Phase 2** (Medium Priority) - Migrate components and hooks
3. **Phase 3** (Low Priority) - Clean up unused imports
4. **Phase 4** (Medium Priority) - Generate and migrate types
5. **Phase 5** (Low Priority) - Archive and cleanup
6. **Phase 6** (High Priority) - Comprehensive testing

---

## Success Criteria

- [ ] Zero `supabase.from()` calls in codebase
- [ ] Zero `supabase.storage` calls in codebase
- [ ] Zero `supabase.auth` calls in codebase (except compatibility layer)
- [ ] Zero `supabase.rpc()` calls in codebase
- [ ] All unused imports removed
- [ ] Edge functions directory archived
- [ ] TypeScript compilation succeeds