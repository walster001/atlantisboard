-- Function to get deletion impact counts for a board
CREATE OR REPLACE FUNCTION public.get_board_deletion_counts(_board_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'columns', (SELECT COUNT(*) FROM columns WHERE board_id = _board_id),
    'cards', (SELECT COUNT(*) FROM cards WHERE column_id IN (SELECT id FROM columns WHERE board_id = _board_id)),
    'members', (SELECT COUNT(*) FROM board_members WHERE board_id = _board_id),
    'labels', (SELECT COUNT(*) FROM labels WHERE board_id = _board_id),
    'attachments', (SELECT COUNT(*) FROM card_attachments WHERE card_id IN (SELECT id FROM cards WHERE column_id IN (SELECT id FROM columns WHERE board_id = _board_id)))
  ) INTO result;
  
  RETURN result;
END;
$function$;

-- Function to get deletion impact counts for a workspace
CREATE OR REPLACE FUNCTION public.get_workspace_deletion_counts(_workspace_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result json;
  board_ids uuid[];
BEGIN
  -- Get all board IDs in this workspace
  SELECT ARRAY_AGG(id) INTO board_ids FROM boards WHERE workspace_id = _workspace_id;
  
  SELECT json_build_object(
    'boards', COALESCE(array_length(board_ids, 1), 0),
    'columns', (SELECT COUNT(*) FROM columns WHERE board_id = ANY(COALESCE(board_ids, ARRAY[]::uuid[]))),
    'cards', (SELECT COUNT(*) FROM cards WHERE column_id IN (SELECT id FROM columns WHERE board_id = ANY(COALESCE(board_ids, ARRAY[]::uuid[])))),
    'members', (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = _workspace_id)
  ) INTO result;
  
  RETURN result;
END;
$function$;