-- Enable full replica identity for cards table (captures complete row data on updates)
ALTER TABLE public.cards REPLICA IDENTITY FULL;

-- Ensure supabase_realtime publication exists before adding tables to it
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
    END IF;
END
$$;

-- Add cards table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.cards;