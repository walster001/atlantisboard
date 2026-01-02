# TypeScript Errors Summary

**Total Errors:** 210

## Error Categories

### 1. Prisma Client Type Exports (20 errors)
**File:** `src/types/prisma.ts`
**Error:** `TS2305: Module '"@prisma/client"' has no exported member 'X'`

**Affected Types:**
- Profile, Workspace, WorkspaceMember, Board, BoardMember, BoardTheme, Column, Card, CardAssignee, CardLabel, CardAttachment, CardSubtask, Label, CustomRole, RolePermission, BoardInviteToken, BoardMemberAuditLog, AppSettings, CustomFont, BoardRole

**Root Cause:** Prisma client needs to be generated before these types are available. The types file is trying to re-export types that don't exist yet.

**Fix:** Ensure Prisma client is generated, or use `Prisma.X` namespace instead of direct exports.

---

### 2. Unused Variables/Imports (TS6133) - ~100+ errors
**Common Pattern:** Variables declared but never used

**Files Affected:**
- `src/index.ts` - unused `req` parameters (lines 70, 93)
- `src/middleware/auth.ts` - unused `res` parameters (lines 17, 63)
- `src/middleware/errorHandler.ts` - unused `req`, `next` parameters (lines 42, 44)
- `src/middleware/permissions.ts` - unused `Request` import, unused `res` parameters (lines 7, 17, 47, 86)
- `src/routes/*.ts` - many unused imports and parameters across route files
- `src/services/*.ts` - unused imports in service files
- `src/realtime/server.ts` - unused `boardId` (line 181)

**Fix:** Remove unused variables or prefix with `_` if needed for interface compliance.

---

### 3. Type Mismatches with Express/AuthRequest (TS2769) - ~50+ errors
**Error:** `TS2769: No overload matches this call`

**Files Affected:**
- `src/routes/admin.ts` (lines 17, 39, 97)
- `src/routes/app-settings.ts` (line 59)
- `src/routes/auth.ts` (line 50)
- Many other route files

**Root Cause:** `AuthRequest` type doesn't match Express's `Request` type. The `user` property type mismatch:
- Express `Request.user`: `User | undefined` (from @types/express)
- Custom `AuthRequest.user`: `{ id: string; email: string; isAdmin: boolean; } | undefined`

**Fix:** Update `AuthRequest` type definition or use type assertions/casting.

---

### 4. Implicit Any Types (TS7006) - ~30+ errors
**Error:** `TS7006: Parameter 'X' implicitly has an 'any' type`

**Files Affected:**
- `src/lib/permissions/service.ts` - parameters `p`, `perm` (lines 61, 112, 171, 177)
- `src/routes/app-settings.ts` - parameter `font` (line 47)
- Various other files

**Fix:** Add explicit type annotations to parameters.

---

### 5. Index Type Issues (TS7053) - ~5 errors
**Error:** `TS7053: Element implicitly has an 'any' type because expression of type 'any' can't be used to index type...`

**Files Affected:**
- `src/lib/permissions/service.ts` (lines 121, 176)

**Fix:** Add proper type guards or type assertions for index access.

---

### 6. Missing Return Value (TS7030) - 1 error
**Error:** `TS7030: Not all code paths return a value`

**File:** `src/middleware/errorHandler.ts` (line 40)

**Fix:** Ensure all code paths return a value or explicitly return `void`.

---

### 7. Duplicate Identifier (TS2300) - 2 errors
**Error:** `TS2300: Duplicate identifier 'Readable'`

**File:** `src/services/storage.service.ts` (lines 10, 13)

**Root Cause:** `Readable` is imported twice from 'stream'

**Fix:** Remove duplicate import.

---

### 8. Variable Used Before Declaration (TS2448, TS2454) - 2 errors
**Error:** `TS2448/TS2454: Block-scoped variable 'validated' used before its declaration`

**File:** `src/services/subtask.service.ts` (line 81)

**Root Cause:** Variable `validated` is used on line 80 before it's declared on line 81.

**Fix:** Move variable declaration before usage.

---

### 9. JWT Service Type Error (TS2769) - 1 error
**Error:** `TS2769: No overload matches this call` in `jwt.sign()`

**File:** `src/services/jwt.service.ts` (line 32)

**Root Cause:** `expiresIn` option type mismatch with jwt.sign() overloads.

**Fix:** Ensure `expiresIn` is a string or number, not undefined.

---

## Priority Fix Order

1. **Critical (Blocks Build):**
   - Prisma client type exports (20 errors)
   - Duplicate Readable import (2 errors)
   - Variable used before declaration (2 errors)
   - JWT service type error (1 error)
   - Missing return value (1 error)

2. **High Priority (Type Safety):**
   - Express/AuthRequest type mismatches (~50 errors)
   - Implicit any types (~30 errors)
   - Index type issues (~5 errors)

3. **Low Priority (Code Quality):**
   - Unused variables/imports (~100+ errors) - Can be fixed incrementally

---

## Quick Wins

1. Remove duplicate `Readable` import in `storage.service.ts`
2. Fix variable declaration order in `subtask.service.ts`
3. Fix Prisma types export (use namespace or generate client first)
4. Add return statement in `errorHandler.ts`
5. Fix JWT service `expiresIn` type

