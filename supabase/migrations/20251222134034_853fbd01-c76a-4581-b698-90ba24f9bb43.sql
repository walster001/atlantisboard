-- Enable REPLICA IDENTITY FULL for permission-related tables to capture complete row data
ALTER TABLE public.custom_roles REPLICA IDENTITY FULL;
ALTER TABLE public.role_permissions REPLICA IDENTITY FULL;
ALTER TABLE public.board_member_custom_roles REPLICA IDENTITY FULL;

-- Add tables to realtime publication
-- This will fail silently if publication is FOR ALL TABLES or tables already in publication
DO $$
BEGIN
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