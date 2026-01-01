-- Setup Realtime publication for all subscribed tables
-- This migration adds all 6 tables to the supabase_realtime publication
-- and sets REPLICA IDENTITY FULL for proper DELETE event handling

-- Enable REPLICA IDENTITY FULL for all subscribed tables
-- This ensures DELETE events include the old row data needed by Realtime
ALTER TABLE public.board_members REPLICA IDENTITY FULL;
ALTER TABLE public.cards REPLICA IDENTITY FULL;
ALTER TABLE public.columns REPLICA IDENTITY FULL;
ALTER TABLE public.custom_roles REPLICA IDENTITY FULL;
ALTER TABLE public.role_permissions REPLICA IDENTITY FULL;
ALTER TABLE public.board_member_custom_roles REPLICA IDENTITY FULL;

-- Add all tables to supabase_realtime publication
-- This will fail silently if publication is FOR ALL TABLES or table already in publication
DO $$
BEGIN
    -- Add board_members if table exists
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'board_members') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.board_members;
        EXCEPTION 
            WHEN duplicate_object THEN NULL;
            WHEN OTHERS THEN
                IF SQLERRM LIKE '%FOR ALL TABLES%' THEN NULL; ELSE RAISE; END IF;
        END;
    END IF;

    -- Add cards if table exists
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cards') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.cards;
        EXCEPTION 
            WHEN duplicate_object THEN NULL;
            WHEN OTHERS THEN
                IF SQLERRM LIKE '%FOR ALL TABLES%' THEN NULL; ELSE RAISE; END IF;
        END;
    END IF;

    -- Add columns if table exists
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'columns') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.columns;
        EXCEPTION 
            WHEN duplicate_object THEN NULL;
            WHEN OTHERS THEN
                IF SQLERRM LIKE '%FOR ALL TABLES%' THEN NULL; ELSE RAISE; END IF;
        END;
    END IF;

    -- Add custom_roles if table exists
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'custom_roles') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.custom_roles;
        EXCEPTION 
            WHEN duplicate_object THEN NULL;
            WHEN OTHERS THEN
                IF SQLERRM LIKE '%FOR ALL TABLES%' THEN NULL; ELSE RAISE; END IF;
        END;
    END IF;

    -- Add role_permissions if table exists
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'role_permissions') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.role_permissions;
        EXCEPTION 
            WHEN duplicate_object THEN NULL;
            WHEN OTHERS THEN
                IF SQLERRM LIKE '%FOR ALL TABLES%' THEN NULL; ELSE RAISE; END IF;
        END;
    END IF;

    -- Add board_member_custom_roles if table exists
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'board_member_custom_roles') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.board_member_custom_roles;
        EXCEPTION 
            WHEN duplicate_object THEN NULL;
            WHEN OTHERS THEN
                IF SQLERRM LIKE '%FOR ALL TABLES%' THEN NULL; ELSE RAISE; END IF;
        END;
    END IF;
END
$$;

