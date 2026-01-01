-- Create a view that masks email for non-admin/non-self users
CREATE OR REPLACE VIEW public.profiles_secure AS
SELECT 
  id,
  full_name,
  avatar_url,
  created_at,
  updated_at,
  is_admin,
  CASE 
    WHEN auth.uid() = id THEN email  -- User can see own email
    WHEN is_app_admin(auth.uid()) THEN email  -- Admins can see all emails
    ELSE NULL  -- Others cannot see email
  END AS email
FROM public.profiles;

-- Grant access to the view
GRANT SELECT ON public.profiles_secure TO authenticated;

-- Create a secure function to get board member profiles with masked emails
CREATE OR REPLACE FUNCTION public.get_board_member_profiles(_board_id uuid)
RETURNS TABLE (
  user_id uuid,
  role text,
  id uuid,
  email text,
  full_name text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    bm.user_id,
    bm.role::text,
    p.id,
    CASE 
      WHEN auth.uid() = p.id THEN p.email  -- User can see own email
      WHEN is_app_admin(auth.uid()) THEN p.email  -- Admins can see all emails
      ELSE NULL  -- Others cannot see email
    END AS email,
    p.full_name,
    p.avatar_url
  FROM board_members bm
  JOIN profiles p ON bm.user_id = p.id
  WHERE bm.board_id = _board_id
    AND (is_board_member(auth.uid(), _board_id) OR is_app_admin(auth.uid()))
$$;