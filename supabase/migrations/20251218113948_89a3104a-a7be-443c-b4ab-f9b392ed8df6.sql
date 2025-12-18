-- Function to get all board data in a single call
CREATE OR REPLACE FUNCTION public.get_board_data(_board_id uuid, _user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  board_record record;
  user_role board_role;
BEGIN
  -- Check if user has access to this board
  IF NOT (is_board_member(_user_id, _board_id) OR is_app_admin(_user_id)) THEN
    RETURN json_build_object('error', 'Access denied');
  END IF;

  -- Get board details
  SELECT * INTO board_record FROM boards WHERE id = _board_id;
  
  IF board_record IS NULL THEN
    RETURN json_build_object('error', 'Board not found');
  END IF;

  -- Get user's role
  SELECT role INTO user_role FROM board_members WHERE board_id = _board_id AND user_id = _user_id;

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
$$;

-- Function to get home page data in a single call
CREATE OR REPLACE FUNCTION public.get_home_data(_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      SELECT json_agg(b ORDER BY b.created_at DESC)
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

-- Function to batch update card positions (single transaction)
CREATE OR REPLACE FUNCTION public.batch_update_card_positions(
  _user_id uuid,
  _updates jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  update_item jsonb;
  card_record record;
  board_id_check uuid;
BEGIN
  -- Validate all cards belong to boards user can edit
  FOR update_item IN SELECT * FROM jsonb_array_elements(_updates)
  LOOP
    SELECT c.board_id INTO board_id_check
    FROM cards ca
    JOIN columns c ON ca.column_id = c.id
    WHERE ca.id = (update_item->>'id')::uuid;

    IF NOT (can_edit_board(_user_id, board_id_check) OR is_app_admin(_user_id)) THEN
      RETURN json_build_object('error', 'Access denied for card ' || (update_item->>'id'));
    END IF;
  END LOOP;

  -- Perform all updates in a single transaction
  FOR update_item IN SELECT * FROM jsonb_array_elements(_updates)
  LOOP
    UPDATE cards
    SET 
      column_id = COALESCE((update_item->>'column_id')::uuid, column_id),
      position = COALESCE((update_item->>'position')::integer, position),
      updated_at = now()
    WHERE id = (update_item->>'id')::uuid;
  END LOOP;

  RETURN json_build_object('success', true, 'updated', jsonb_array_length(_updates));
END;
$$;

-- Function to batch update column positions (single transaction)
CREATE OR REPLACE FUNCTION public.batch_update_column_positions(
  _user_id uuid,
  _board_id uuid,
  _updates jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  update_item jsonb;
BEGIN
  -- Check permission
  IF NOT (can_edit_board(_user_id, _board_id) OR is_app_admin(_user_id)) THEN
    RETURN json_build_object('error', 'Access denied');
  END IF;

  -- Perform all updates
  FOR update_item IN SELECT * FROM jsonb_array_elements(_updates)
  LOOP
    UPDATE columns
    SET position = (update_item->>'position')::integer
    WHERE id = (update_item->>'id')::uuid AND board_id = _board_id;
  END LOOP;

  RETURN json_build_object('success', true, 'updated', jsonb_array_length(_updates));
END;
$$;