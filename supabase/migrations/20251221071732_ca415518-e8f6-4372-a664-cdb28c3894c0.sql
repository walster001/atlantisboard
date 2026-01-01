-- Create table for one-time-use invite tokens
CREATE TABLE public.board_invite_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours'),
  used_at TIMESTAMP WITH TIME ZONE,
  used_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Create index for fast token lookups
CREATE INDEX idx_board_invite_tokens_token ON public.board_invite_tokens(token);
CREATE INDEX idx_board_invite_tokens_board_id ON public.board_invite_tokens(board_id);

-- Enable RLS
ALTER TABLE public.board_invite_tokens ENABLE ROW LEVEL SECURITY;

-- Only board admins can create invite tokens
CREATE POLICY "Board admins can create invite tokens"
ON public.board_invite_tokens
FOR INSERT
WITH CHECK (
  can_edit_board(auth.uid(), board_id) AND auth.uid() = created_by
);

-- Board admins can view invite tokens for their boards
CREATE POLICY "Board admins can view invite tokens"
ON public.board_invite_tokens
FOR SELECT
USING (
  can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid())
);

-- Board admins can update (mark as used) invite tokens
CREATE POLICY "Board admins can update invite tokens"
ON public.board_invite_tokens
FOR UPDATE
USING (
  can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid())
);

-- Board admins can delete invite tokens
CREATE POLICY "Board admins can delete invite tokens"
ON public.board_invite_tokens
FOR DELETE
USING (
  can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid())
);

-- Function to validate and redeem an invite token (bypasses RLS for token validation)
CREATE OR REPLACE FUNCTION public.validate_and_redeem_invite_token(_token TEXT, _user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Check if already used
  IF token_record.used_at IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'already_used', 'message', 'This invite link has already been used.');
  END IF;

  -- Check if expired
  IF token_record.expires_at < now() THEN
    RETURN json_build_object('success', false, 'error', 'expired', 'message', 'This invite link has expired.');
  END IF;

  -- Check if user is already a board member
  SELECT * INTO existing_member
  FROM board_members
  WHERE board_id = token_record.board_id AND user_id = _user_id;

  IF existing_member IS NOT NULL THEN
    -- Mark token as used even if already a member
    UPDATE board_invite_tokens
    SET used_at = now(), used_by = _user_id
    WHERE id = token_record.id;
    
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

  -- Mark token as used
  UPDATE board_invite_tokens
  SET used_at = now(), used_by = _user_id
  WHERE id = token_record.id;

  -- Log the action
  INSERT INTO board_member_audit_log (board_id, action, target_user_id, actor_user_id, new_role)
  VALUES (token_record.board_id, 'added_via_invite', _user_id, token_record.created_by, 'viewer');

  RETURN json_build_object(
    'success', true, 
    'board_id', token_record.board_id,
    'message', 'You have been added to the board.'
  );
END;
$$;

-- Function to check if current user can create invite tokens for a board
CREATE OR REPLACE FUNCTION public.can_create_board_invite(_user_id UUID, _board_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT can_edit_board(_user_id, _board_id)
$$;