-- Drop the existing check constraint and add a new one that includes 'added_via_invite'
-- Only proceed if the table exists and handle multiple re-runs gracefully
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'board_member_audit_log') THEN
        -- Find the actual constraint name (it might be auto-generated or named)
        SELECT conname INTO constraint_name
        FROM pg_constraint
        WHERE conrelid = 'public.board_member_audit_log'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%action IN%'
        LIMIT 1;
        
        -- Drop the constraint if it exists (whether named or auto-generated)
        IF constraint_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.board_member_audit_log DROP CONSTRAINT IF EXISTS %I', constraint_name);
        END IF;
        
        -- Drop the named constraint if it exists (for re-runs)
        ALTER TABLE public.board_member_audit_log DROP CONSTRAINT IF EXISTS board_member_audit_log_action_check;
        
        -- Only add constraint if it doesn't already exist (handles multiple re-runs)
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'board_member_audit_log_action_check' 
            AND conrelid = 'public.board_member_audit_log'::regclass
        ) THEN
            ALTER TABLE public.board_member_audit_log ADD CONSTRAINT board_member_audit_log_action_check 
            CHECK (action IN ('added', 'removed', 'role_changed', 'added_via_invite'));
        END IF;
    END IF;
END
$$;