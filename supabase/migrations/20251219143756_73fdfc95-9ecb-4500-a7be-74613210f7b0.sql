-- Add position column to boards for ordering within workspaces
ALTER TABLE public.boards ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

-- Create index for better performance on position queries
CREATE INDEX IF NOT EXISTS idx_boards_workspace_position ON public.boards(workspace_id, position);

-- Create function to move board to different workspace
CREATE OR REPLACE FUNCTION public.move_board_to_workspace(
  _user_id uuid,
  _board_id uuid,
  _new_workspace_id uuid,
  _new_position integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  old_workspace_id uuid;
  board_record record;
BEGIN
  -- Check if user can edit the board (is board admin or app admin)
  IF NOT (can_edit_board(_user_id, _board_id) OR is_app_admin(_user_id)) THEN
    RETURN json_build_object('error', 'Access denied: you must be a board admin to move this board');
  END IF;

  -- Get current board info
  SELECT * INTO board_record FROM boards WHERE id = _board_id;
  IF board_record IS NULL THEN
    RETURN json_build_object('error', 'Board not found');
  END IF;
  
  old_workspace_id := board_record.workspace_id;

  -- Check if user has access to target workspace (is workspace owner/member or app admin)
  IF NOT (is_workspace_member(_user_id, _new_workspace_id) OR is_app_admin(_user_id)) THEN
    RETURN json_build_object('error', 'Access denied: you must have access to the target workspace');
  END IF;

  -- If same workspace, just update positions
  IF old_workspace_id = _new_workspace_id THEN
    -- Shift other boards' positions in the same workspace
    UPDATE boards
    SET position = position + 1
    WHERE workspace_id = _new_workspace_id
      AND position >= _new_position
      AND id != _board_id;

    -- Update board position
    UPDATE boards
    SET position = _new_position, updated_at = now()
    WHERE id = _board_id;
  ELSE
    -- Moving to different workspace
    -- Update positions in old workspace (shift down)
    UPDATE boards
    SET position = position - 1
    WHERE workspace_id = old_workspace_id
      AND position > board_record.position;

    -- Shift positions in new workspace to make room
    UPDATE boards
    SET position = position + 1
    WHERE workspace_id = _new_workspace_id
      AND position >= _new_position;

    -- Move the board to new workspace
    UPDATE boards
    SET workspace_id = _new_workspace_id,
        position = _new_position,
        updated_at = now()
    WHERE id = _board_id;
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- Create function to batch update board positions within a workspace
CREATE OR REPLACE FUNCTION public.batch_update_board_positions(
  _user_id uuid,
  _workspace_id uuid,
  _updates jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  update_item jsonb;
BEGIN
  -- Check if user has access to this workspace
  IF NOT (is_workspace_member(_user_id, _workspace_id) OR is_app_admin(_user_id)) THEN
    RETURN json_build_object('error', 'Access denied');
  END IF;

  -- Perform all updates
  FOR update_item IN SELECT * FROM jsonb_array_elements(_updates)
  LOOP
    -- Verify board belongs to this workspace and user can edit it
    IF NOT EXISTS (
      SELECT 1 FROM boards 
      WHERE id = (update_item->>'id')::uuid 
        AND workspace_id = _workspace_id
    ) THEN
      CONTINUE;
    END IF;

    IF NOT (can_edit_board(_user_id, (update_item->>'id')::uuid) OR is_app_admin(_user_id)) THEN
      CONTINUE;
    END IF;

    UPDATE boards
    SET position = (update_item->>'position')::integer
    WHERE id = (update_item->>'id')::uuid;
  END LOOP;

  RETURN json_build_object('success', true, 'updated', jsonb_array_length(_updates));
END;
$$;