-- Update the validate_and_redeem_invite_token function to allow NULL expires_at for recurring links
CREATE OR REPLACE FUNCTION public.validate_and_redeem_invite_token(_token text, _user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  token_record RECORD;
  existing_member RECORD;
BEGIN
  -- Find the token
  SELECT * INTO token_record
  FROM board_invite_tokens
  WHERE token = _token;

  -- Check if token exists
  IF token_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'invalid_token', 'message', 'This invite link is invalid.');
  END IF;

  -- For one-time tokens, check if already used
  IF token_record.link_type = 'one_time' AND token_record.used_at IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'already_used', 'message', 'This invite link has already been used.');
  END IF;

  -- Check if expired (only for one-time links with expiry, recurring links have NULL expires_at)
  IF token_record.expires_at IS NOT NULL AND token_record.expires_at < now() THEN
    RETURN json_build_object('success', false, 'error', 'expired', 'message', 'This invite link has expired.');
  END IF;

  -- Check if user is already a board member
  SELECT * INTO existing_member
  FROM board_members
  WHERE board_id = token_record.board_id AND user_id = _user_id;

  IF existing_member IS NOT NULL THEN
    -- For one-time tokens, mark as used even if already a member
    IF token_record.link_type = 'one_time' THEN
      UPDATE board_invite_tokens
      SET used_at = now(), used_by = _user_id
      WHERE id = token_record.id;
    END IF;
    
    RETURN json_build_object(
      'success', true, 
      'already_member', true, 
      'board_id', token_record.board_id,
      'message', 'You are already a member of this board.'
    );
  END IF;

  -- Add user as viewer to the board
  INSERT INTO board_members (board_id, user_id, role)
  VALUES (token_record.board_id, _user_id, 'viewer');

  -- For one-time tokens, mark as used
  IF token_record.link_type = 'one_time' THEN
    UPDATE board_invite_tokens
    SET used_at = now(), used_by = _user_id
    WHERE id = token_record.id;
  END IF;

  -- Log the action
  INSERT INTO board_member_audit_log (board_id, action, target_user_id, actor_user_id, new_role)
  VALUES (token_record.board_id, 'added_via_invite', _user_id, token_record.created_by, 'viewer');

  RETURN json_build_object(
    'success', true, 
    'board_id', token_record.board_id,
    'message', 'You have been added to the board.'
  );
END;
$function$;