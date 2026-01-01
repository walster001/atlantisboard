# Archived Edge Functions

**Date Archived:** 2025-01-XX  
**Reason:** All edge functions have been migrated to REST endpoints in the self-hosted backend.

## Migration Mapping

All Supabase Edge Functions have been replaced with REST API endpoints:

| Edge Function | REST Endpoint | Method | Notes |
|--------------|---------------|--------|-------|
| `generate-invite-token` | `/api/boards/:id/invites/generate` | POST | Generates invite tokens for board access |
| `redeem-invite-token` | `/api/invites/redeem` | POST | Redeems invite tokens to join boards |
| `import-wekan-board` | `/api/boards/import` | POST | Imports Wekan board data (SSE streaming) |
| `save-mysql-config` | `/api/admin/mysql-config` | POST | Saves MySQL configuration for email verification |
| `test-mysql-connection` | `/api/admin/mysql-config/test` | POST | Tests MySQL connection configuration |
| `verify-user-email` | `/api/auth/verify-email` | POST | Verifies user email against MySQL database |

## Implementation Details

- **Backend Location:** `backend/src/routes/`
- **Services:** `backend/src/services/`
- **Authentication:** JWT-based (replaces Supabase Auth)
- **Database:** Prisma ORM (replaces Supabase PostgREST)

## Status

✅ All functions successfully migrated  
✅ All endpoints tested and working  
✅ Backward compatibility maintained through API client

## Notes

- These functions are kept for historical reference
- They can be safely deleted after confirming all functionality works in production
- The migration was completed as part of the Supabase to self-hosted backend migration

