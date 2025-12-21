-- Enable REPLICA IDENTITY FULL so DELETE events include the old row data
ALTER TABLE public.board_members REPLICA IDENTITY FULL;

-- Add board_members to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.board_members;