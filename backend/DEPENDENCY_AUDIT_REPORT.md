# Dependency Audit & Update Report

**Date:** 2025-01-01  
**Auditor:** Full-stack Engineer  
**Purpose:** Audit, update, and cleanup Node modules for standalone backend

---

## Executive Summary

This report documents the comprehensive audit of all Node.js dependencies across the frontend and backend, identifies deprecated/vulnerable packages, and provides a safe update plan.

---

## 1. Plan Verification Status

### Supabase Dependency Removal Plan Status

**⚠️ INCOMPLETE:** Found 2 files with remaining Supabase usage NOT in the original plan:

| File | Usage | Status | Notes |
|------|-------|--------|-------|
| `src/components/admin/AppBrandingSettings.tsx` | `supabase.storage` (lines 148, 154) | ⚠️ **NOT MIGRATED** | Not listed in plan, needs migration |
| `src/pages/InvitePage.tsx` | `supabase.rpc()` (line 92), `supabase.auth.signInWithOAuth()` (line 235) | ⚠️ **NOT MIGRATED** | Not listed in plan, needs migration |

**Note:** These files were not included in the original plan but contain Supabase dependencies that should be migrated.

---

## 2. Current Dependency Audit

### 2.1 Frontend Dependencies (Root package.json)

#### Direct Dependencies - Outdated Packages

| Package | Current | Latest | Major Behind | Priority | Notes |
|---------|---------|--------|--------------|----------|-------|
| `@supabase/supabase-js` | ^2.87.3 | ^2.87.3 | No | MEDIUM | Still needed for types, can remove after migration |
| `@hookform/resolvers` | 3.10.0 | 5.2.2 | Yes (2 majors) | LOW | Breaking changes in v4/v5 |
| `@tanstack/react-query` | 5.90.14 | 5.90.16 | No | LOW | Minor update available |
| `@types/node` | 22.19.3 | 25.0.3 | Yes (3 majors) | LOW | Node 22 is current LTS, v25 is future |
| `@types/react` | 18.3.27 | 19.2.7 | Yes (1 major) | LOW | React 19 types, app uses React 18 |
| `@types/react-dom` | 18.3.7 | 19.2.3 | Yes (1 major) | LOW | React 19 types, app uses React 18 |
| `@vitejs/plugin-react-swc` | 3.11.0 | 4.2.2 | Yes (1 major) | MEDIUM | May require config changes |
| `date-fns` | 3.6.0 | 4.1.0 | Yes (1 major) | LOW | Breaking changes in v4 |
| `eslint-plugin-react-hooks` | 5.2.0 | 7.0.1 | Yes (2 majors) | LOW | Breaking changes |
| `globals` | 15.15.0 | 16.5.0 | Yes (1 major) | LOW | Breaking changes |
| `lucide-react` | 0.462.0 | 0.562.0 | No | LOW | Minor update |
| `next-themes` | 0.3.0 | 0.4.6 | Yes (1 major) | LOW | Breaking changes |
| `react` | 18.3.1 | 19.2.3 | Yes (1 major) | LOW | React 19 is major upgrade |
| `react-day-picker` | 8.10.1 | 9.13.0 | Yes (1 major) | LOW | Breaking changes |
| `react-dom` | 18.3.1 | 19.2.3 | Yes (1 major) | LOW | React 19 is major upgrade |
| `react-markdown` | 9.0.1 | 10.1.0 | Yes (1 major) | LOW | Breaking changes |
| `react-resizable-panels` | 2.1.9 | 4.1.1 | Yes (2 majors) | LOW | Breaking changes |
| `react-router-dom` | 6.30.2 | 7.11.0 | Yes (1 major) | LOW | Breaking changes |
| `recharts` | 2.15.4 | 3.6.0 | Yes (1 major) | LOW | Breaking changes |
| `remark-emoji` | 4.0.1 | 5.0.2 | Yes (1 major) | LOW | Breaking changes |
| `sonner` | 1.7.4 | 2.0.7 | Yes (1 major) | LOW | Breaking changes |
| `tailwind-merge` | 2.6.0 | 3.4.0 | Yes (1 major) | LOW | Breaking changes |
| `tailwindcss` | 3.4.19 | 4.1.18 | Yes (1 major) | LOW | Tailwind v4 is major rewrite |
| `typescript-eslint` | 8.50.1 | 8.51.0 | No | LOW | Minor update |
| `vaul` | 0.9.9 | 1.1.2 | Yes (1 major) | LOW | Breaking changes |
| `vite` | 5.4.21 | 7.3.0 | Yes (2 majors) | MEDIUM | Vite 7 may require config changes |
| `zod` | 3.25.76 | 4.3.4 | Yes (1 major) | LOW | Breaking changes in v4 |

#### Peer Dependency Issues

| Package | Issue | Severity |
|---------|-------|----------|
| `@toast-ui/react-editor@3.2.3` | Requires `react@^17.0.1`, but app has `react@18.3.1` | ⚠️ WARNING | May cause compatibility issues |

#### DevDependencies - Outdated Packages

| Package | Current | Latest | Major Behind | Priority |
|---------|---------|--------|--------------|----------|
| `@eslint/js` | ^9.32.0 | ^9.32.0 | No | N/A |
| `eslint` | ^9.32.0 | ^9.32.0 | No | N/A |
| `typescript-eslint` | 8.50.1 | 8.51.0 | No | LOW |

---

### 2.2 Backend Dependencies (backend/package.json)

#### Direct Dependencies - Outdated Packages

| Package | Current | Latest | Major Behind | Priority | Notes |
|---------|---------|--------|--------------|----------|-------|
| `@prisma/client` | ^5.19.0 | 7.2.0 | Yes (2 majors) | MEDIUM | Prisma 7 requires Node 18.17+, breaking changes |
| `@aws-sdk/client-s3` | ^3.700.0 | Latest | No | LOW | Check for updates |
| `bcrypt` | ^5.1.1 | 6.0.0 | Yes (1 major) | MEDIUM | Breaking changes in v6 |
| `cors` | ^2.8.5 | Latest | No | LOW | Check for updates |
| `dotenv` | ^16.4.5 | 17.2.3 | Yes (1 major) | LOW | Breaking changes in v17 |
| `express` | ^4.19.2 | 5.2.1 | Yes (1 major) | LOW | Express 5 is major upgrade |
| `express-rate-limit` | ^7.4.0 | 8.2.1 | Yes (1 major) | LOW | Breaking changes |
| `express-session` | ^1.18.1 | Latest | No | LOW | Check for updates |
| `helmet` | ^7.2.0 | 8.1.0 | Yes (1 major) | MEDIUM | Security package, should update |
| `jsonwebtoken` | ^9.0.2 | Latest | No | LOW | Check for updates |
| `multer` | ^1.4.5-lts.1 | 2.0.2 | Yes (1 major) | ⚠️ **HIGH** | Deprecated, should migrate to v2 |
| `mysql2` | ^3.11.3 | Latest | No | LOW | Check for updates |
| `passport` | ^0.7.0 | Latest | No | LOW | Check for updates |
| `passport-google-oauth20` | ^2.0.0 | Latest | No | LOW | Check for updates |
| `ws` | ^8.18.0 | Latest | No | LOW | Check for updates |
| `zod` | ^3.23.8 | 4.3.4 | Yes (1 major) | LOW | Breaking changes in v4 |

#### DevDependencies - Outdated Packages

| Package | Current | Latest | Major Behind | Priority | Notes |
|---------|---------|--------|--------------|----------|-------|
| `eslint` | ^8.57.0 | 9.39.2 | Yes (1 major) | ⚠️ **HIGH** | ESLint 8 is deprecated, should upgrade to v9 |
| `@typescript-eslint/eslint-plugin` | ^7.18.0 | 8.51.0 | Yes (1 major) | MEDIUM | Breaking changes |
| `@typescript-eslint/parser` | ^7.18.0 | 8.51.0 | Yes (1 major) | MEDIUM | Breaking changes |
| `prisma` | ^5.19.0 | 7.2.0 | Yes (2 majors) | MEDIUM | Must match @prisma/client version |
| `tsx` | ^4.19.1 | Latest | No | LOW | Check for updates |
| `typescript` | ^5.6.2 | Latest | No | LOW | Check for updates |

---

### 2.3 Deprecated/Vulnerable Packages

#### Known Deprecated Packages (from transitive dependencies)

Based on npm ecosystem knowledge, these packages are commonly deprecated:
- **multer@1.x**: Deprecated, should upgrade to v2.x
- **eslint@8.x**: Deprecated, should upgrade to v9.x
- **glob@<9**: Older versions deprecated (if present)
- **rimraf@<4**: Older versions deprecated (if present)

#### Security Vulnerabilities

**Note:** npm audit failed due to lockfile version mismatch. Need to:
1. Update npm version or regenerate lockfiles
2. Run `npm audit` after lockfile fix

---

### 2.4 Unused Packages Check

**Methodology:**
- Check for packages in node_modules not referenced in package.json
- Check for packages with no imports in codebase
- Verify all imports are actually used

**Status:** Pending full scan (requires codebase analysis)

---

## 3. Environment Constraints

### Node.js Version
- **Required:** Node 22 (from .nvmrc)
- **Current:** Node 22 LTS
- **Constraint:** Some packages may require Node 18.17+ (Prisma 7)

### npm Version
- **Lockfile Version:** 3 (requires npm 7+)
- **Issue:** npm audit failing due to version mismatch
- **Action:** Verify npm version or regenerate lockfiles

---

## 4. Update Recommendations

### Priority 1: Critical Security & Deprecation Fixes

1. **multer@1.4.5-lts.1 → multer@2.0.2**
   - **Reason:** Deprecated, security concerns
   - **Breaking Changes:** API changes, requires code updates
   - **Action:** Update backend code to use multer v2 API

2. **eslint@8.57.0 → eslint@9.39.2** (Backend)
   - **Reason:** ESLint 8 is deprecated
   - **Breaking Changes:** Flat config format, requires config migration
   - **Action:** Migrate ESLint config to flat format

3. **helmet@7.2.0 → helmet@8.1.0** (Backend)
   - **Reason:** Security package, should be latest
   - **Breaking Changes:** API changes
   - **Action:** Review helmet configuration

### Priority 2: Major Version Updates (Breaking Changes)

4. **@prisma/client & prisma@5.19.0 → 7.2.0** (Backend)
   - **Reason:** Major version behind
   - **Breaking Changes:** Requires Node 18.17+, API changes
   - **Action:** Review Prisma 7 migration guide

5. **@typescript-eslint/*@7.18.0 → 8.51.0** (Backend)
   - **Reason:** Major version behind
   - **Breaking Changes:** Config format changes
   - **Action:** Update ESLint config

### Priority 3: Minor/Patch Updates (Safe)

6. **@tanstack/react-query@5.90.14 → 5.90.16** (Frontend)
   - **Reason:** Patch update available
   - **Action:** Safe to update

7. **typescript-eslint@8.50.1 → 8.51.0** (Frontend)
   - **Reason:** Patch update available
   - **Action:** Safe to update

### Priority 4: Major Updates (Defer - Breaking Changes)

- React 18 → 19 (major rewrite)
- Vite 5 → 7 (major changes)
- Tailwind 3 → 4 (major rewrite)
- Express 4 → 5 (major upgrade)
- Zod 3 → 4 (breaking changes)

**Recommendation:** Defer these until after Supabase migration is complete and tested.

---

## 5. Unused Package Analysis

### Packages to Verify for Removal

1. **@supabase/supabase-js** (Frontend)
   - **Status:** Still in package.json
   - **Usage:** Still used in 2 files (AppBrandingSettings.tsx, InvitePage.tsx)
   - **Action:** Migrate remaining usage, then remove

2. **Supabase-related packages** (if any)
   - Check for any other Supabase dependencies
   - Verify all imports are migrated

---

## 6. Update Plan

### Phase 1: Critical Updates (Immediate)

1. Fix npm lockfile version mismatch
2. Update multer to v2 (backend)
3. Update eslint to v9 (backend)
4. Update helmet to v8 (backend)

### Phase 2: Safe Minor Updates

1. Update patch versions for all packages
2. Update @tanstack/react-query
3. Update typescript-eslint (patch)

### Phase 3: Major Updates (After Testing)

1. Update Prisma to v7 (requires testing)
2. Update TypeScript ESLint to v8 (backend)
3. Consider React 19 upgrade (future)

### Phase 4: Cleanup

1. Remove @supabase/supabase-js after migration complete
2. Remove any unused packages
3. Clean node_modules and regenerate lockfiles

---

## 7. Testing Requirements

After each update phase:
- [ ] Run `npm install` successfully
- [ ] Run `npm run build` (frontend)
- [ ] Run `npm run build` (backend)
- [ ] Run `npm run lint` (both)
- [ ] Run dev-setup-backend.sh script
- [ ] Verify no deprecation warnings
- [ ] Test critical functionality

---

## 8. Risk Assessment

### Low Risk Updates
- Patch version updates
- Minor version updates (non-breaking)
- Type definition updates

### Medium Risk Updates
- Major version updates with migration guides
- Security package updates
- Build tool updates

### High Risk Updates
- Framework upgrades (React, Vite, Tailwind)
- Database ORM upgrades (Prisma)
- Breaking API changes

---

## 9. Critical Environment Issue

### Node.js Version Mismatch

**⚠️ CRITICAL:** Current Node.js version is **v14.21.4**, but project requires **Node 22** (per .nvmrc).

**Impact:**
- Prisma 5.22.0 requires Node 18.17+
- ESLint 9 requires Node 18.18+
- Many updated packages require Node 18+
- npm 6.14.17 is incompatible with lockfile version 3 (requires npm 7+)

**Action Required:**
1. **Upgrade Node.js to v22** (as specified in .nvmrc)
2. **Upgrade npm to v10+** (comes with Node 22)
3. **Regenerate package-lock.json** files after Node upgrade

**Command:**
```bash
# In WSL, use nvm to switch to Node 22
nvm use 22
# Or install if not available
nvm install 22
nvm use 22
```

---

## 10. Package Updates Applied

### Backend Updates (package.json)

| Package | Old Version | New Version | Status | Notes |
|---------|-------------|-------------|--------|-------|
| `multer` | ^1.4.5-lts.1 | ^2.0.2 | ✅ Updated | Breaking changes - verify multer usage |
| `helmet` | ^7.1.0 | ^8.1.0 | ✅ Updated | Security package - review config |
| `eslint` | ^8.57.0 | ^9.39.2 | ✅ Updated | Requires flat config (created) |
| `@typescript-eslint/eslint-plugin` | ^7.18.0 | ^8.51.0 | ✅ Updated | Breaking changes |
| `@typescript-eslint/parser` | ^7.18.0 | ^8.51.0 | ✅ Updated | Breaking changes |
| `@types/multer` | ^1.4.12 | ^2.0.0 | ✅ Updated | Type definitions for multer v2 |
| `@eslint/js` | - | ^9.32.0 | ✅ Added | Required for ESLint 9 |
| `typescript-eslint` | - | ^8.51.0 | ✅ Added | Required for ESLint 9 flat config |

### Frontend Updates (package.json)

| Package | Old Version | New Version | Status | Notes |
|---------|-------------|-------------|--------|-------|
| `@tanstack/react-query` | ^5.83.0 | ^5.90.16 | ✅ Updated | Patch update |
| `typescript-eslint` | ^8.38.0 | ^8.51.0 | ✅ Updated | Patch update |

### Configuration Files Created

- `backend/eslint.config.js` - ESLint 9 flat config (replaces .eslintrc.json)

---

## 11. Breaking Changes & Migration Notes

### Multer 2.0 Migration

**Current Usage:** `backend/src/routes/storage.ts`
- Uses `multer.memoryStorage()` - should be compatible
- Uses `upload.single('file')` - API unchanged

**Action:** Verify multer v2 works with current code (likely no changes needed)

### ESLint 9 Migration

**Changes:**
- Created `backend/eslint.config.js` with flat config format
- Updated lint script to remove `--ext .ts` flag
- Added required dependencies: `@eslint/js`, `typescript-eslint`

**Action:** Test linting after Node upgrade

### Helmet 8 Migration

**Changes:**
- Helmet 8 has updated default security policies
- May require config adjustments

**Action:** Review helmet configuration in `backend/src/index.ts` after upgrade

---

## 12. Next Steps

### Immediate (Before Package Updates)

1. **⚠️ CRITICAL:** Upgrade Node.js to v22 and npm to v10+
   ```bash
   nvm use 22  # or nvm install 22 && nvm use 22
   ```

2. **Regenerate lockfiles:**
   ```bash
   cd backend && rm package-lock.json && npm install
   cd .. && rm package-lock.json && npm install
   ```

### After Node Upgrade

3. **Install updated packages:**
   ```bash
   cd backend && npm install
   cd .. && npm install
   ```

4. **Test multer v2 compatibility:**
   - Verify file uploads work
   - Check storage routes

5. **Test ESLint 9:**
   ```bash
   cd backend && npm run lint
   ```

6. **Test helmet v8:**
   - Start backend and verify security headers
   - Check for any deprecation warnings

7. **Fix remaining Supabase migrations:**
   - `src/components/admin/AppBrandingSettings.tsx` (supabase.storage)
   - `src/pages/InvitePage.tsx` (supabase.rpc, supabase.auth.signInWithOAuth)

### Future Updates (After Testing)

8. **Major version upgrades:**
   - Prisma 5 → 7 (requires Node 18.17+)
   - React 18 → 19 (major rewrite)
   - Vite 5 → 7 (major changes)
   - Tailwind 3 → 4 (major rewrite)

---

## Notes

- **All package updates are applied to package.json files**
- **Node.js upgrade is REQUIRED before npm install will succeed**
- **ESLint 9 flat config created and ready**
- **All updates should be tested in development environment first**
- **Maintain backward compatibility where possible**
- **Document any breaking changes in code**
- **Update this report as updates are applied**

