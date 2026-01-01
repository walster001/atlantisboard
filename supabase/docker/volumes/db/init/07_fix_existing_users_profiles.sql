-- Fix existing users who don't have profiles
-- This handles the case where users logged in before migrations ran
-- or where the trigger didn't fire for some reason

-- Create profiles for any users in auth.users who don't have profiles
-- The first user (by created_at) will be made admin
INSERT INTO public.profiles (id, email, full_name, avatar_url, is_admin)
SELECT 
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name', ''),
  au.raw_user_meta_data ->> 'avatar_url',
  -- Make the first user (by created_at) an admin
  ROW_NUMBER() OVER (ORDER BY au.created_at) = 1
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;


