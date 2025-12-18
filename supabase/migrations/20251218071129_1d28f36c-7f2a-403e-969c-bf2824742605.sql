-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;

-- Create a security definer function to check if users share a board
CREATE OR REPLACE FUNCTION public.shares_board_with(_viewer_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_members bm1
    JOIN board_members bm2 ON bm1.board_id = bm2.board_id
    WHERE bm1.user_id = _viewer_id 
      AND bm2.user_id = _profile_id
  )
$$;

-- Create a security definer function to check if users share a workspace
CREATE OR REPLACE FUNCTION public.shares_workspace_with(_viewer_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Both are workspace members
    SELECT 1 FROM workspace_members wm1
    JOIN workspace_members wm2 ON wm1.workspace_id = wm2.workspace_id
    WHERE wm1.user_id = _viewer_id
      AND wm2.user_id = _profile_id
  ) OR EXISTS (
    -- Viewer owns workspace that profile is member of
    SELECT 1 FROM workspaces w
    JOIN workspace_members wm ON w.id = wm.workspace_id
    WHERE w.owner_id = _viewer_id
      AND wm.user_id = _profile_id
  ) OR EXISTS (
    -- Profile owns workspace that viewer is member of
    SELECT 1 FROM workspaces w
    JOIN workspace_members wm ON w.id = wm.workspace_id
    WHERE w.owner_id = _profile_id
      AND wm.user_id = _viewer_id
  ) OR EXISTS (
    -- Both own workspaces (they can see each other as owners)
    SELECT 1 FROM workspaces w1, workspaces w2
    WHERE w1.owner_id = _viewer_id
      AND w2.owner_id = _profile_id
  )
$$;

-- Create a secure function for email lookup (for adding board members)
CREATE OR REPLACE FUNCTION public.find_user_by_email(_email text, _board_id uuid)
RETURNS TABLE (id uuid, email text, full_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.email, p.full_name, p.avatar_url
  FROM profiles p
  WHERE p.email = _email
    AND (can_manage_members(auth.uid(), _board_id) OR is_app_admin(auth.uid()))
$$;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Policy: App admins can view all profiles
CREATE POLICY "App admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (is_app_admin(auth.uid()));

-- Policy: Users can view profiles of board co-members
CREATE POLICY "View board co-member profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (shares_board_with(auth.uid(), id));

-- Policy: Users can view profiles of workspace co-members
CREATE POLICY "View workspace co-member profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (shares_workspace_with(auth.uid(), id));