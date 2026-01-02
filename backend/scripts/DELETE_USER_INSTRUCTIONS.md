# Instructions to Delete User

To delete the user `matthewwaldhuter@gmail.com` from the database, you have several options:

## Option 1: Using the Node.js Script (Recommended)

1. Open WSL terminal
2. Navigate to the backend directory:
   ```bash
   cd /mnt/e/atlantisboard/backend
   ```
3. Make sure Node.js is available (you may need to load nvm first):
   ```bash
   source ~/.nvm/nvm.sh  # if using nvm
   # or ensure node is in PATH
   ```
4. Run the script:
   ```bash
   node scripts/delete-user.mjs matthewwaldhuter@gmail.com
   ```

## Option 2: Using Prisma Studio

1. Open WSL terminal and navigate to backend directory
2. Run Prisma Studio:
   ```bash
   npm run prisma:studio
   ```
3. Navigate to the `users` table
4. Find the user with email `matthewwaldhuter@gmail.com`
5. Delete the user (this will cascade delete the profile)

## Option 3: Using SQL directly

If you have direct database access, you can run:

```sql
-- Delete refresh tokens first
DELETE FROM refresh_tokens 
WHERE user_id IN (
  SELECT id FROM users WHERE email = 'matthewwaldhuter@gmail.com'
);

-- Delete the user (cascades to profile)
DELETE FROM users 
WHERE email = 'matthewwaldhuter@gmail.com';
```

## Verification

After deletion, you can verify by running:
```bash
node scripts/check-database-state.mjs
```
Or check in Prisma Studio that the user no longer exists.

