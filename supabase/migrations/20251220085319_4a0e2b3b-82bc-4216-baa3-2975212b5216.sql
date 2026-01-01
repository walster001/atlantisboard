-- Add global audit log retention setting to app_settings
ALTER TABLE public.app_settings 
ADD COLUMN IF NOT EXISTS audit_log_retention_days integer DEFAULT NULL;

-- Update the cleanup function to use global setting from app_settings
CREATE OR REPLACE FUNCTION public.cleanup_expired_audit_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  deleted_count INTEGER;
  global_retention INTEGER;
BEGIN
  -- Get the global retention setting
  SELECT audit_log_retention_days INTO global_retention
  FROM app_settings
  WHERE id = 'default';

  -- If no retention is set (NULL), don't delete anything
  IF global_retention IS NULL THEN
    RETURN 0;
  END IF;

  -- Delete expired audit logs based on global retention
  WITH deleted AS (
    DELETE FROM board_member_audit_log
    WHERE created_at < (now() - (global_retention || ' days')::interval)
    RETURNING *
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$function$;