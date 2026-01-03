---
name: Fix Admin Loading and Update Errors
overview: "Fix three critical issues: (1) Update query syntax error - move .eq() before .update(), (2) GET query error - remove unsupported nullsFirst option and fix boolean filter parsing, (3) Ensure realtime subscriptions work for profile updates."
todos:
  - id: fix-update-query-syntax
    content: Fix update query in AppAdminUserList.tsx - move .eq() before .update() (line 128-131)
    status: completed
  - id: fix-order-nullsFirst
    content: Remove unsupported nullsFirst option from .order() call in AppAdminUserList.tsx (line 101)
    status: completed
  - id: fix-boolean-filter-parsing
    content: Update backend parseFilters() to convert string 'true'/'false' to boolean values (backend/src/routes/db.ts line 30, 37)
    status: completed
  - id: fix-appbranding-update-pattern
    content: Fix .update().eq() pattern in AppBrandingSettings.tsx for consistency (line 161, 185)
    status: completed
    dependencies:
      - fix-update-query-syntax
---

# F

ix App Admin Loading and Updating Errors

## Root Causes Identified

1. **Update Query Syntax Error**: `AppAdminUserList.tsx` calls `.update().eq()` but `update()` returns a Promise, not a chainable query builder. The `.eq()` filter must be called BEFORE `.update()`.
2. **GET Query Error**: Two issues:

- `AppAdminUserList.tsx` uses `nullsFirst: false` option in `.order()` but this option is not supported by the API client or backend
- Backend `parseFilters()` converts boolean values to strings (e.g., `"true"`), but Prisma needs actual boolean values for Boolean fields

3. **Realtime**: Backend already emits events, but needs verification that frontend subscriptions are working correctly

## Files to Modify

### Frontend Files

1. **[src/components/admin/permissions/AppAdminUserList.tsx](src/components/admin/permissions/AppAdminUserList.tsx)**

- Line 96-101: Remove `nullsFirst: false` from `.order()` call
- Line 128-131: Fix update query by moving `.eq()` before `.update()`

2. **[src/components/admin/AppBrandingSettings.tsx](src/components/admin/AppBrandingSettings.tsx)** (if needed)

- Line 161, 185: Fix same `.update().eq()` pattern (may be working but should be fixed for consistency)

### Backend Files

3. **[backend/src/routes/db.ts](backend/src/routes/db.ts)**

- Line 14-43: Update `parseFilters()` to convert string "true"/"false" to boolean values for Boolean fields

## Implementation Details

### Fix 1: Update Query Syntax

**Current (broken):**

```typescript
const { error } = await api
  .from('profiles')
  .update({ isAdmin: newAdminStatus })
  .eq('id', targetUser.id);
```

**Fixed:**

```typescript
const { error } = await api
  .from('profiles')
  .eq('id', targetUser.id)
  .update({ isAdmin: newAdminStatus });
```



### Fix 2: Remove nullsFirst Option

**Current (broken):**

```typescript
.order('fullName', { ascending: true, nullsFirst: false });
```

**Fixed:**

```typescript
.order('fullName', { ascending: true });
```



### Fix 3: Boolean Filter Parsing

Update `parseFilters()` in `backend/src/routes/db.ts` to convert string "true"/"false" to boolean:

```typescript
value: filterValue === 'null' ? null : 
       filterValue === 'true' ? true :
       filterValue === 'false' ? false : filterValue,
```

Apply the same logic for simple equality case (line 37).

## Testing Checklist

- [ ] Load admin list without 500 error
- [ ] Filter by isAdmin=true works correctly  
- [ ] Update admin status for a user succeeds
- [ ] UI updates immediately after admin status change