-- Enable REPLICA IDENTITY FULL so DELETE events include the old row data
ALTER TABLE public.board_members REPLICA IDENTITY FULL;

-- Add board_members to the realtime publication
-- This will fail silently if publication is FOR ALL TABLES or table already in publication
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'board_members') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.board_members;
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