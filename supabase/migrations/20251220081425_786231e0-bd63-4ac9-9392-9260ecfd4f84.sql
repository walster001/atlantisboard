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

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Enable pg_net for HTTP calls (needed for cron)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;