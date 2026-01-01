-- Update get_home_data to order boards by position
CREATE OR REPLACE FUNCTION public.get_home_data(_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'workspaces', COALESCE((
      SELECT json_agg(w ORDER BY w.created_at DESC)
      FROM workspaces w
      WHERE is_workspace_member(_user_id, w.id) 
        OR is_board_member_in_workspace(_user_id, w.id) 
        OR is_app_admin(_user_id)
    ), '[]'::json),
    'boards', COALESCE((
      SELECT json_agg(b ORDER BY b.workspace_id, b.position, b.created_at DESC)
      FROM boards b
      WHERE is_board_member(_user_id, b.id) OR is_app_admin(_user_id)
    ), '[]'::json),
    'board_roles', COALESCE((
      SELECT json_object_agg(bm.board_id, bm.role)
      FROM board_members bm
      WHERE bm.user_id = _user_id
    ), '{}'::json)
  ) INTO result;

  RETURN result;
END;
$$;