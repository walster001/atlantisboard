-- Function to update a card (server-side with permission check)
CREATE OR REPLACE FUNCTION public.update_card(
  _user_id uuid,
  _card_id uuid,
  _title text DEFAULT NULL,
  _description text DEFAULT NULL,
  _due_date timestamptz DEFAULT NULL,
  _clear_due_date boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  board_id_check uuid;
  updated_card record;
BEGIN
  -- Get the board_id for permission check
  SELECT c.board_id INTO board_id_check
  FROM cards ca
  JOIN columns c ON ca.column_id = c.id
  WHERE ca.id = _card_id;

  IF board_id_check IS NULL THEN
    RETURN json_build_object('error', 'Card not found');
  END IF;

  -- Check permission
  IF NOT (can_edit_board(_user_id, board_id_check) OR is_app_admin(_user_id)) THEN
    RETURN json_build_object('error', 'Access denied');
  END IF;

  -- Update the card with provided fields
  UPDATE cards
  SET 
    title = COALESCE(_title, title),
    description = COALESCE(_description, description),
    due_date = CASE 
      WHEN _clear_due_date THEN NULL
      WHEN _due_date IS NOT NULL THEN _due_date
      ELSE due_date
    END,
    updated_at = now()
  WHERE id = _card_id
  RETURNING * INTO updated_card;

  RETURN json_build_object(
    'success', true,
    'card', json_build_object(
      'id', updated_card.id,
      'column_id', updated_card.column_id,
      'title', updated_card.title,
      'description', updated_card.description,
      'position', updated_card.position,
      'due_date', updated_card.due_date,
      'created_by', updated_card.created_by,
      'updated_at', updated_card.updated_at
    )
  );
END;
$$;