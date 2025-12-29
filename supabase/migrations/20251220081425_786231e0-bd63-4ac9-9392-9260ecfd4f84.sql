-- Add audit log retention setting to boards table
ALTER TABLE public.boards 
ADD COLUMN audit_log_retention_days INTEGER DEFAULT NULL;

-- NULL means never expire, otherwise it's the number of days to keep logs

-- Create function to clean up expired audit logs
CREATE OR REPLACE FUNCTION public.cleanup_expired_audit_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER := 0;
  board_record RECORD;
BEGIN
  -- Loop through boards with retention settings
  FOR board_record IN 
    SELECT id, audit_log_retention_days 
    FROM boards 
    WHERE audit_log_retention_days IS NOT NULL
  LOOP
    -- Delete old audit logs for this board
    DELETE FROM board_member_audit_log
    WHERE board_id = board_record.id
      AND created_at < (now() - (board_record.audit_log_retention_days || ' days')::interval);
    
    deleted_count := deleted_count + (SELECT COUNT(*) FROM board_member_audit_log WHERE FALSE); -- Get affected rows
  END LOOP;
  
  -- Get actual deleted count using a different approach
  WITH deleted AS (
    DELETE FROM board_member_audit_log
    WHERE board_id IN (SELECT id FROM boards WHERE audit_log_retention_days IS NOT NULL)
      AND created_at < (
        SELECT now() - (b.audit_log_retention_days || ' days')::interval
        FROM boards b
        WHERE b.id = board_member_audit_log.board_id
      )
    RETURNING *
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- Create a more efficient cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_expired_audit_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM board_member_audit_log al
    USING boards b
    WHERE al.board_id = b.id
      AND b.audit_log_retention_days IS NOT NULL
      AND al.created_at < (now() - (b.audit_log_retention_days || ' days')::interval)
    RETURNING al.*
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- Ensure extensions schema exists (in case init script didn't run)
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
        CREATE ROLE supabase_admin NOLOGIN NOINHERIT BYPASSRLS;
    END IF;
END
$$;
GRANT USAGE ON SCHEMA extensions TO supabase_admin;
GRANT ALL ON SCHEMA extensions TO postgres;

-- Enable pg_cron extension if not already enabled
-- Wrap in DO block to handle permission errors gracefully
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
EXCEPTION
    WHEN insufficient_privilege THEN
        -- Extension requires superuser, skip if not available
        NULL;
    WHEN OTHERS THEN
        -- If extension already exists or other non-critical error, continue
        IF SQLERRM LIKE '%already exists%' OR SQLERRM LIKE '%permission denied%' THEN
            NULL;
        ELSE
            RAISE;
        END IF;
END
$$;

-- Enable pg_net for HTTP calls (needed for cron)
-- Wrap in DO block to handle permission errors gracefully
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
EXCEPTION
    WHEN insufficient_privilege THEN
        -- Extension requires superuser, skip if not available
        NULL;
    WHEN OTHERS THEN
        -- If extension already exists or other non-critical error, continue
        IF SQLERRM LIKE '%already exists%' OR SQLERRM LIKE '%permission denied%' THEN
            NULL;
        ELSE
            RAISE;
        END IF;
END
$$;