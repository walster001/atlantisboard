# Phase 7: Cleanup & Final Audit

## Summary

This document tracks the cleanup and audit process for removing Supabase dependencies and unused code after the migration to a self-hosted backend.

## Remaining Supabase Dependencies

### Frontend Dependencies

1. **`@supabase/supabase-js` package** - Still in `package.json`
   - **Status**: Can be removed after verifying all database queries use the new API client
   - **Action**: Remove from package.json once all `supabase.from()` calls are replaced

2. **`src/integrations/supabase/client.ts`** - Supabase client initialization
   - **Status**: Still referenced by many files, but should be replaced with `api` client
   - **Action**: Gradually replace all `supabase.from()` calls with `api.from()` or direct API calls

3. **`src/integrations/supabase/types.ts`** - TypeScript types for Supabase database
   - **Status**: May still be needed for type definitions
   - **Action**: Keep for now, or generate new types from Prisma schema

### Edge Functions

All edge functions in `supabase/functions/` have been replaced with REST endpoints:
- ✅ `generate-invite-token` → `POST /api/boards/:id/invites/generate`
- ✅ `redeem-invite-token` → `POST /api/invites/redeem`
- ✅ `import-wekan-board` → `POST /api/boards/import`
- ✅ `save-mysql-config` → `POST /api/admin/mysql-config`
- ✅ `test-mysql-connection` → `POST /api/admin/mysql-config/test`
- ✅ `verify-user-email` → `POST /api/auth/verify-email`

**Action**: Edge functions can be archived or removed after confirming all frontend calls use new endpoints.

### Files Still Using Supabase Client

The following files still import or use `supabase` client:
- `src/pages/Home.tsx` - Has unused import
- `src/pages/BoardPage.tsx` - May still use for database queries
- `src/realtime/homeSubscriptions.ts` - Uses for realtime subscriptions (already migrated)
- `src/realtime/boardSubscriptions.ts` - Uses for realtime subscriptions (already migrated)
- `src/realtime/permissionsSubscriptions.ts` - Uses for realtime subscriptions (already migrated)
- `src/components/admin/permissions/usePermissionsData.ts` - May use for queries
- `src/hooks/useAppSettings.tsx` - May use for queries
- Various component files - Need to check if they use `supabase.from()`

**Action**: Audit each file to determine if it's using Supabase for:
1. Database queries (`supabase.from()`) - Should be replaced with `api.from()` or direct API calls
2. Realtime subscriptions (`supabase.realtime`) - Already migrated to custom WebSocket client
3. Storage operations (`supabase.storage`) - Already migrated to S3-compatible storage

## Unused Code

### Comments and References

1. **"Edge function" references in comments**
   - `src/components/kanban/InviteLinkButton.tsx` - Line 54, 102
   - `src/integrations/api/client.ts` - Line 245

**Action**: Update comments to reflect new REST endpoints

### Unused Imports

Files with unused `supabase` imports:
- `src/pages/Home.tsx` - Import exists but may not be used
- `src/components/admin/LoginOptionsSettings.tsx` - Already updated
- `src/pages/InvitePage.tsx` - Already updated
- `src/components/kanban/InviteLinkButton.tsx` - Already updated

**Action**: Remove unused imports after verifying no usage

## Migration Status

### ✅ Completed Migrations

1. **Authentication** - Fully migrated to custom JWT system
2. **Database Queries** - API client provides `from()` method compatible with Supabase
3. **Storage** - Migrated to S3-compatible storage
4. **Realtime** - Migrated to custom WebSocket server
5. **Edge Functions** - All replaced with REST endpoints

### ⚠️ Partially Migrated

1. **Database Query Usage** - Some files may still use `supabase.from()` directly
   - Need to verify all files use `api.from()` instead
   - The API client provides compatibility, but direct Supabase usage should be removed

2. **Type Definitions** - Still using Supabase-generated types
   - Consider generating types from Prisma schema for better type safety

## Recommended Actions

### Immediate (High Priority)

1. ✅ Remove unused `supabase` imports from files that have been migrated
2. ✅ Update comments referencing "edge functions" to "REST endpoints"
3. ⚠️ Audit all files using `supabase.from()` and replace with `api.from()`
4. ⚠️ Verify no files are using `supabase.functions.invoke()` (should all be migrated)

### Short-term (Medium Priority)

1. Remove `@supabase/supabase-js` from package.json after confirming no usage
2. Archive or remove edge functions directory
3. Generate TypeScript types from Prisma schema
4. Update documentation to reflect new architecture

### Long-term (Low Priority)

1. Remove Supabase client initialization file if no longer needed
2. Clean up Supabase-specific environment variables
3. Update deployment scripts to remove Supabase setup steps

## Notes

- The `api` client provides a Supabase-compatible interface (`from()`, `rpc()`, `storage`, `realtime`)
- This allows gradual migration without breaking existing code
- Once all direct Supabase usage is removed, the Supabase package can be removed
- Edge functions directory can be kept for reference or removed after migration is verified

