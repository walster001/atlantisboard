-- SQL script to delete a user by email
-- This will cascade delete the profile and refresh tokens
-- 
-- Usage: Run this in your database client or via psql:
-- psql $DATABASE_URL -f scripts/delete-user.sql
-- 
-- Or modify the email below and run directly

BEGIN;

-- Set the email to delete (modify this)
\set email 'matthewwaldhuter@gmail.com'

-- Find and display the user first (for verification)
SELECT id, email, provider, provider_id 
FROM users 
WHERE email = :'email';

-- Delete refresh tokens
DELETE FROM refresh_tokens 
WHERE user_id IN (
  SELECT id FROM users WHERE email = :'email'
);

-- Delete the user (this will cascade delete the profile due to FK constraints)
DELETE FROM users 
WHERE email = :'email';

-- Verify deletion
SELECT 'User deleted. Remaining profiles:' as status;
SELECT COUNT(*) as total_profiles FROM profiles;

COMMIT;

