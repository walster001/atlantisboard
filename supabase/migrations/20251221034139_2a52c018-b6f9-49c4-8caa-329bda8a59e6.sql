-- Update get_board_data to allow preview mode access when user_id is the special preview UUID
CREATE OR REPLACE FUNCTION public.get_board_data(_board_id uuid, _user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result json;
  board_record record;
  user_role board_role;
  is_preview_mode boolean;
BEGIN
  -- Check if this is preview mode (special UUID used for testing)
  is_preview_mode := _user_id = '00000000-0000-0000-0000-000000000000'::uuid;

  -- Check if user has access to this board (skip check in preview mode)
  IF NOT is_preview_mode AND NOT (is_board_member(_user_id, _board_id) OR is_app_admin(_user_id)) THEN
    RETURN json_build_object('error', 'Access denied');
  END IF;

  -- Get board details
  SELECT * INTO board_record FROM boards WHERE id = _board_id;
  
  IF board_record IS NULL THEN
    RETURN json_build_object('error', 'Board not found');
  END IF;

  -- Get user's role (null in preview mode)
  IF NOT is_preview_mode THEN
    SELECT role INTO user_role FROM board_members WHERE board_id = _board_id AND user_id = _user_id;
  ELSE
    user_role := 'admin'::board_role; -- Grant admin role in preview mode
  END IF;

  -- Build complete result
  SELECT json_build_object(
    'board', json_build_object(
      'id', board_record.id,
      'name', board_record.name,
      'description', board_record.description,
      'background_color', board_record.background_color,
      'workspace_id', board_record.workspace_id
    ),
    'user_role', user_role,
    'columns', COALESCE((
      SELECT json_agg(c ORDER BY c.position)
      FROM columns c
      WHERE c.board_id = _board_id
    ), '[]'::json),
    'cards', COALESCE((
      SELECT json_agg(ca)
      FROM cards ca
      WHERE ca.column_id IN (SELECT id FROM columns WHERE board_id = _board_id)
    ), '[]'::json),
    'labels', COALESCE((
      SELECT json_agg(l)
      FROM labels l
      WHERE l.board_id = _board_id
    ), '[]'::json),
    'card_labels', COALESCE((
      SELECT json_agg(cl)
      FROM card_labels cl
      WHERE cl.card_id IN (
        SELECT ca.id FROM cards ca
        WHERE ca.column_id IN (SELECT id FROM columns WHERE board_id = _board_id)
      )
    ), '[]'::json),
    'members', COALESCE((
      SELECT json_agg(json_build_object(
        'user_id', bm.user_id,
        'role', bm.role,
        'profiles', json_build_object(
          'id', p.id,
          'email', CASE 
            WHEN is_preview_mode THEN p.email
            WHEN _user_id = p.id THEN p.email
            WHEN is_app_admin(_user_id) THEN p.email
            ELSE NULL
          END,
          'full_name', p.full_name,
          'avatar_url', p.avatar_url
        )
      ))
      FROM board_members bm
      JOIN profiles p ON bm.user_id = p.id
      WHERE bm.board_id = _board_id
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$function$;