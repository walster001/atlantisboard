-- Create a security definer function to check if user is member of any board in a workspace
CREATE OR REPLACE FUNCTION public.is_board_member_in_workspace(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_members bm
    JOIN boards b ON bm.board_id = b.id
    WHERE bm.user_id = _user_id 
      AND b.workspace_id = _workspace_id
  )
$$;

-- Drop the existing workspace SELECT policy
DROP POLICY IF EXISTS "Workspace members or admins can view workspaces" ON public.workspaces;

-- Create updated policy that includes board members
CREATE POLICY "Workspace or board members can view workspaces" ON public.workspaces
  FOR SELECT TO authenticated
  USING (
    is_workspace_member(auth.uid(), id) 
    OR is_board_member_in_workspace(auth.uid(), id)
    OR is_app_admin(auth.uid())
  );