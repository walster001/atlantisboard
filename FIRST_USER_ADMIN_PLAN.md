# Plan: Make First User App Admin

## Problem
The first user that signs up (via email or Google OAuth) is not automatically made an app admin. This means they cannot see the "New Workspace" and "Import" buttons on the homepage, preventing them from creating workspaces and boards.

## Root Cause
In `backend/src/services/auth.service.ts`:
- The `signUp()` method (line 47-53) creates a profile with `isAdmin: false` by default
- The `findOrCreateGoogleUser()` method (line 257-264) also creates a profile with `isAdmin: false` by default
- There is no logic to check if this is the first user and automatically set `isAdmin: true`

The Prisma schema confirms `isAdmin` defaults to `false` (schema.prisma line 79).

## Solution
Add logic to automatically make the first user an app admin when they sign up. This should work for both email signup and Google OAuth signup.

## Implementation Steps

### Step 1: Add helper method to check if this is the first user
- In `backend/src/services/auth.service.ts`, add a private method `isFirstUser()` that:
  - Counts the total number of profiles in the database
  - Returns `true` if count is 0 (no existing profiles)

### Step 2: Update `signUp()` method
- In the transaction that creates the user and profile (line 37-56):
  - Before creating the profile, call `isFirstUser()` to check if this is the first user
  - If it's the first user, set `isAdmin: true` when creating the profile
  - Otherwise, use the default `isAdmin: false`

### Step 3: Update `findOrCreateGoogleUser()` method
- In the transaction that creates a new Google user (line 247-267):
  - Before creating the profile, call `isFirstUser()` to check if this is the first user
  - If it's the first user, set `isAdmin: true` when creating the profile
  - Otherwise, use the default `isAdmin: false`
- Note: This only applies when creating a NEW user (line 246-267), not when linking to an existing user

### Step 4: Handle race conditions
- Since multiple users could theoretically sign up simultaneously, use a transaction with proper locking
- The `isFirstUser()` check should happen within the same transaction as profile creation
- Use `prisma.profile.count()` inside the transaction to ensure atomicity

## Files to Modify
1. `backend/src/services/auth.service.ts`
   - Add `isFirstUser()` helper method
   - Update `signUp()` method to check and set `isAdmin: true` for first user
   - Update `findOrCreateGoogleUser()` method to check and set `isAdmin: true` for first user

## Testing Considerations
1. Test email signup as first user - should become admin
2. Test Google OAuth as first user - should become admin
3. Test second user signup - should NOT become admin
4. Test that existing users remain non-admin if they weren't the first user
5. Test edge case: simultaneous signups (race condition) - should only first one becomes admin

## Notes
- The check should use `prisma.profile.count()` which is efficient
- Since we're using transactions, the check and creation are atomic
- If two users sign up simultaneously, the database transaction will ensure only one gets `isAdmin: true`
- The first transaction to commit will set the first user as admin, subsequent transactions will see 1 profile exists and not set admin status

