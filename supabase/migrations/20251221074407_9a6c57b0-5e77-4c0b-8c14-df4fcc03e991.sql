-- Drop the existing check constraint and add a new one that includes 'added_via_invite'
-- Only proceed if the table exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'board_member_audit_log') THEN
        ALTER TABLE public.board_member_audit_log DROP CONSTRAINT IF EXISTS board_member_audit_log_action_check;
        
        ALTER TABLE public.board_member_audit_log ADD CONSTRAINT board_member_audit_log_action_check 
        CHECK (action IN ('added', 'removed', 'role_changed', 'added_via_invite'));
    END IF;
END
$$;