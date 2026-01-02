# Homepage Loading Fix

## Issue Analysis

After OAuth completes successfully, the boards homepage doesn't load. The flow is:

1. ✅ OAuth callback redirects with tokens in URL hash
2. ✅ Frontend extracts tokens and calls `api.auth.getSession()`
3. ✅ Session established, user authenticated
4. ❌ Homepage calls `api.rpc('get_home_data')` which fails

## Root Cause

The homepage endpoint (`get_home_data`) queries:
- `workspaces` table
- `workspace_members` table  
- `boards` table
- `board_members` table
- `board_themes` table

These tables don't exist in the database, causing the query to fail.

## Solution

### Step 1: Create All Required Tables

Run the comprehensive table setup:

```bash
cd /mnt/e/atlantisboard/backend
./setup-all-tables.sh
```

This creates:
- ✅ `users` table
- ✅ `profiles` table
- ✅ `refresh_tokens` table
- ✅ `app_settings` table
- ✅ `workspaces` table
- ✅ `workspace_members` table
- ✅ `board_themes` table
- ✅ `boards` table
- ✅ `board_members` table
- All necessary indexes

### Step 2: Test Homepage Endpoint

Verify the endpoint works:

```bash
./test-homepage-endpoint.sh
```

This will:
- Check if all required tables exist
- Test `homeService.getHomeData()` with a real user
- Show any missing tables or errors

### Step 3: Verify OAuth Flow

The OAuth flow should:
1. Redirect to Google OAuth
2. Return with tokens in URL hash
3. Frontend extracts tokens
4. Calls `/api/auth/me` to get user info (now includes provider)
5. Calls `/api/rpc/get_home_data` to load homepage data

## Fixed Issues

1. **Provider Detection**: Updated `/api/auth/me` to return `provider` field
2. **API Client**: Updated `getSession()` to use provider from API response
3. **Table Creation**: Comprehensive script to create all required tables

## Verification

After running `setup-all-tables.sh`, test the full flow:

1. **OAuth Login**: Should redirect and return with tokens
2. **Session**: Should be established with correct provider
3. **Homepage**: Should load with empty workspaces/boards (normal for new user)

## Next Steps

If homepage still doesn't load after creating tables:

1. Check browser console for errors
2. Check backend logs for errors
3. Run `./test-homepage-endpoint.sh` to diagnose
4. Verify user has a profile created (OAuth should create this)

