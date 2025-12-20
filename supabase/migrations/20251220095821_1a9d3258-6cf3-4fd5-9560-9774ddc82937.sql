
-- Update the trigger function to check if the board still exists before logging
CREATE OR REPLACE FUNCTION public.log_board_member_removed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only log if the board still exists (not being cascade deleted)
  IF EXISTS (SELECT 1 FROM public.boards WHERE id = OLD.board_id) THEN
    INSERT INTO public.board_member_audit_log (board_id, action, target_user_id, actor_user_id, old_role)
    VALUES (OLD.board_id, 'removed', OLD.user_id, auth.uid(), OLD.role::text);
  END IF;
  RETURN OLD;
END;
$function$;
