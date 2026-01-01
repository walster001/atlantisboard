-- Allow NULL expires_at for recurring invite links
ALTER TABLE public.board_invite_tokens 
ALTER COLUMN expires_at DROP NOT NULL;