# Phase 8: Cleanup & Audit Report

## Executive Summary

This report documents the comprehensive audit of the codebase to identify Supabase dependencies, unused files, and cleanup opportunities after the migration to a self-hosted backend.

## Audit Methodology

1. **Scan for Supabase imports/references**: Grep search across entire codebase
2. **Identify unused files**: Check imports, requires, and dynamic imports
3. **Check Supabase-specific code paths**: Identify files using Supabase client directly
4. **Verify no Lovable SDK dependencies**: Search for Lovable-specific code
5. **Document findings**: Create actionable cleanup recommendations

## Findings

### 1. Supabase Package Dependency

**Status**: ⚠️ **STILL PRESENT**

- **Location**: `package.json` line 43
- **Package**: `@supabase/supabase-js": "^2.87.3"`
- **Usage**: Still imported in 25+ files
- **Action Required**: 
  - Cannot remove yet - still used for type definitions (`RealtimePostgresChangesPayload`)
  - Some files still use `supabase.from()` directly
  - **Recommendation**: Keep until all direct usage is migrated

### 2. Files Using Supabase Client Directly

**Status**: ⚠️ **NEEDS MIGRATION**

Files still using `supabase.from()` for database queries (21 matches across 8 files):

1. **`src/pages/BoardPage.tsx`** - 8 uses
   - **Purpose**: Main board page, loads board data
   - **Action**: Migrate to `api.from()` or use `/api/boards/:id/data` endpoint
   - **Priority**: HIGH

2. **`src/components/admin/permissions/usePermissionsData.ts`** - 2 uses
   - **Purpose**: Fetches custom roles and permissions
   - **Action**: Migrate to `api.from()`
   - **Priority**: MEDIUM

3. **`src/components/kanban/BoardLabelsSettings.tsx`** - 2 uses
   - **Purpose**: Board label management
   - **Action**: Migrate to `api.from()`
   - **Priority**: MEDIUM

4. **`src/components/admin/AppBrandingSettings.tsx`** - 2 uses
   - **Purpose**: App branding settings
   - **Action**: Migrate to `api.from()`
   - **Priority**: MEDIUM

5. **`src/pages/Home.tsx`** - 4 uses
   - **Purpose**: Home dashboard, workspace/board listing
   - **Action**: Migrate to `api.from()` or use `/api/home` endpoint
   - **Priority**: HIGH

6. **`src/components/import/BoardImportDialog.tsx`** - 1 use
   - **Purpose**: Board import functionality
   - **Action**: Already migrated to REST endpoint, remove unused import
   - **Priority**: LOW

7. **`src/components/kanban/BoardSettingsModal.tsx`** - 1 use
   - **Purpose**: Board settings management
   - **Action**: Migrate to `api.from()`
   - **Priority**: MEDIUM

8. **`src/components/kanban/BoardMembersDialog.tsx`** - 1 use
   - **Purpose**: Board member management
   - **Action**: Migrate to `api.from()`
   - **Priority**: MEDIUM

### 3. Files Using Supabase for Types Only

**Status**: ✅ **ACCEPTABLE** (temporary)

Files importing Supabase types but not using client:

1. **`src/realtime/homeSubscriptions.ts`** - Uses `RealtimePostgresChangesPayload` type
2. **`src/realtime/boardSubscriptions.ts`** - Uses `RealtimePostgresChangesPayload` type
3. **`src/realtime/permissionsSubscriptions.ts`** - Uses `RealtimePostgresChangesPayload` type
4. **`src/components/admin/permissions/usePermissionsData.ts`** - Uses `Database` type

**Action**: 
- These are acceptable for now
- Consider generating types from Prisma schema in future
- **Priority**: LOW

### 4. Supabase Client File

**Status**: ⚠️ **STILL REFERENCED**

- **Location**: `src/integrations/supabase/client.ts`
- **Usage**: Imported by 25+ files
- **Action**: 
  - Keep for now (used by compatibility layer)
  - Remove once all direct usage is migrated
  - **Priority**: MEDIUM

### 5. Supabase Types File

**Status**: ✅ **KEEP FOR NOW**

- **Location**: `src/integrations/supabase/types.ts`
- **Usage**: Used for TypeScript type definitions
- **Action**: 
  - Keep until Prisma types are generated
  - **Priority**: LOW

### 6. Edge Functions Directory

**Status**: ⚠️ **CAN BE ARCHIVED**

- **Location**: `supabase/functions/`
- **Status**: All functions migrated to REST endpoints
- **Functions**:
  - `generate-invite-token` → `POST /api/boards/:id/invites/generate`
  - `redeem-invite-token` → `POST /api/invites/redeem`
  - `import-wekan-board` → `POST /api/boards/import`
  - `save-mysql-config` → `POST /api/admin/mysql-config`
  - `test-mysql-connection` → `POST /api/admin/mysql-config/test`
  - `verify-user-email` → `POST /api/auth/verify-email`

**Action**: 
- Archive or remove after verification
- **Priority**: LOW

### 7. Supabase Migrations Directory

**Status**: ✅ **KEEP FOR REFERENCE**

- **Location**: `supabase/migrations/`
- **Status**: Keep for reference, schema migrated to Prisma
- **Action**: Keep for historical reference
- **Priority**: N/A

### 8. Lovable SDK Dependencies

**Status**: ✅ **NONE FOUND**

- **Search Results**: Only found references in:
  - Documentation files (comments)
  - HTML meta tags (index.html)
  - CSS (lovable-badge styling)
  - Deployment scripts (comments)

**Action**: 
- No SDK dependencies found
- References are cosmetic/documentation only
- **Priority**: N/A

### 9. Unused Imports

**Status**: ⚠️ **NEEDS CLEANUP**

Files with unused Supabase imports:

1. **`src/pages/Home.tsx`** - Import removed in Phase 7
2. **`src/components/import/BoardImportDialog.tsx`** - May have unused import
3. **`src/components/admin/LoginOptionsSettings.tsx`** - Already updated

**Action**: Remove unused imports
**Priority**: LOW

### 10. Realtime Client Compatibility Layer

**Status**: ✅ **WORKING AS INTENDED**

- **Location**: `src/realtime/realtimeClient.ts`
- **Status**: Uses compatibility layer that maps to `api.realtime`
- **Note**: Still references `supabase` variable but it's a compatibility shim
- **Action**: No action needed - this is the intended compatibility layer
- **Priority**: N/A

### 11. Hooks Using Supabase

**Status**: ⚠️ **NEEDS MIGRATION**

1. **`src/hooks/useAppSettings.tsx`** - Uses `supabase.from('app_settings')`
   - **Action**: Migrate to `api.from('app_settings')`
   - **Priority**: MEDIUM

## Cleanup Recommendations

### Immediate Actions (High Priority)

1. **Migrate Database Queries** (Priority: HIGH)
   - `src/pages/BoardPage.tsx` - 8 uses of `supabase.from()`
   - `src/pages/Home.tsx` - 4 uses of `supabase.from()`
   - Replace with `api.from()` or use existing REST endpoints

2. **Remove Unused Imports** (Priority: LOW)
   - Clean up any unused Supabase imports

### Short-term Actions (Medium Priority)

3. **Migrate Remaining Components** (Priority: MEDIUM)
   - `src/components/admin/permissions/usePermissionsData.ts`
   - `src/components/kanban/BoardLabelsSettings.tsx`
   - `src/components/admin/AppBrandingSettings.tsx`
   - `src/components/kanban/BoardSettingsModal.tsx`
   - `src/components/kanban/BoardMembersDialog.tsx`
   - `src/hooks/useAppSettings.tsx`

4. **Archive Edge Functions** (Priority: LOW)
   - Move `supabase/functions/` to archive or remove
   - Document migration mapping

### Long-term Actions (Low Priority)

5. **Remove Supabase Package** (Priority: LOW)
   - After all direct usage is migrated
   - Keep types temporarily if needed

6. **Generate Prisma Types** (Priority: LOW)
   - Generate TypeScript types from Prisma schema
   - Replace Supabase types

7. **Remove Supabase Client File** (Priority: LOW)
   - After all direct usage is migrated

## Files to Keep

- `src/integrations/supabase/types.ts` - Keep for type definitions (temporary)
- `supabase/migrations/` - Keep for historical reference
- `src/realtime/realtimeClient.ts` - Keep (compatibility layer)

## Files to Archive/Remove

- `supabase/functions/` - Archive or remove (all migrated)
- Unused Supabase imports - Remove

## Verification Checklist

- [x] Scanned entire codebase for Supabase imports/references
- [x] Identified unused files
- [x] Checked for Supabase-specific code paths
- [x] Verified no Lovable SDK dependencies
- [x] Created comprehensive cleanup report
- [ ] Migrate remaining `supabase.from()` calls (8 files)
- [ ] Remove unused imports
- [ ] Archive edge functions directory
- [ ] Remove `@supabase/supabase-js` package (after migration complete)

## Summary Statistics

- **Files with Supabase imports**: 25+
- **Files using `supabase.from()` directly**: 8 files (21 uses)
- **Files using Supabase types only**: 4 files
- **Edge functions migrated**: 6/6 (100%)
- **Lovable SDK dependencies**: 0
- **Unused files identified**: 1 (edge functions directory)

## Next Steps

1. **Priority 1**: Migrate `BoardPage.tsx` and `Home.tsx` (highest impact)
2. **Priority 2**: Migrate remaining component files
3. **Priority 3**: Clean up unused imports and archive edge functions
4. **Priority 4**: Remove Supabase package after verification

## Notes

- The API client provides Supabase-compatible interface, making migration straightforward
- Type definitions from Supabase can be kept temporarily
- Edge functions are fully migrated and can be archived
- No breaking changes required - migration can be gradual

