-- Enable full replica identity for cards table (captures complete row data on updates)
ALTER TABLE public.cards REPLICA IDENTITY FULL;

-- Ensure supabase_realtime publication exists before adding tables to it
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END
$$;

-- Add cards table to realtime publication
-- This will fail silently if publication is FOR ALL TABLES or table already in publication
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cards') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.cards;
        EXCEPTION 
            WHEN duplicate_object THEN
                -- Table already in publication, ignore
                NULL;
            WHEN OTHERS THEN
                -- If publication is FOR ALL TABLES, this will fail with a specific error
                -- We ignore it since FOR ALL TABLES already includes all tables
                IF SQLERRM LIKE '%FOR ALL TABLES%' THEN
                    NULL;
                ELSE
                    RAISE;
                END IF;
        END;
    END IF;
END
$$;