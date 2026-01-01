-- Remove the policies that expose full profile data (including emails) to co-members
-- The get_board_member_profiles function will be used instead, which masks emails

DROP POLICY IF EXISTS "View board co-member profiles" ON public.profiles;
DROP POLICY IF EXISTS "View workspace co-member profiles" ON public.profiles;

-- Keep only:
-- 1. "Users can view own profile" - users see their own data
-- 2. "App admins can view all profiles" - admins see everything
-- Co-member profile access is now ONLY through the get_board_member_profiles function
-- which masks email addresses for non-admin/non-self users