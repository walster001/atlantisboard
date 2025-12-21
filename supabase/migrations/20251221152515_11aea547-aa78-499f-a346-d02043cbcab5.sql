-- Ensure board_members table has REPLICA IDENTITY FULL
-- This is required for DELETE events to include all row data (user_id, board_id)
ALTER TABLE public.board_members REPLICA IDENTITY FULL;