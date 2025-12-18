-- Enable full replica identity for cards table (captures complete row data on updates)
ALTER TABLE public.cards REPLICA IDENTITY FULL;

-- Add cards table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.cards;