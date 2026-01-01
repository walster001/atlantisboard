-- Create audit log table for board member changes
CREATE TABLE public.board_member_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  action TEXT NOT NULL CONSTRAINT board_member_audit_log_action_check CHECK (action IN ('added', 'removed', 'role_changed')),
  target_user_id UUID NOT NULL,
  actor_user_id UUID,
  old_role TEXT,
  new_role TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient queries
CREATE INDEX idx_board_member_audit_log_board_id ON public.board_member_audit_log(board_id);
CREATE INDEX idx_board_member_audit_log_created_at ON public.board_member_audit_log(created_at DESC);

-- Enable RLS
ALTER TABLE public.board_member_audit_log ENABLE ROW LEVEL SECURITY;

-- Only board admins or app admins can view audit logs
CREATE POLICY "Board admins or app admins can view audit logs"
ON public.board_member_audit_log
FOR SELECT
USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

-- Allow inserts from triggers (service role) and app admins
CREATE POLICY "System can insert audit logs"
ON public.board_member_audit_log
FOR INSERT
WITH CHECK (true);

-- Create function to log member additions
CREATE OR REPLACE FUNCTION public.log_board_member_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.board_member_audit_log (board_id, action, target_user_id, actor_user_id, new_role)
  VALUES (NEW.board_id, 'added', NEW.user_id, auth.uid(), NEW.role::text);
  RETURN NEW;
END;
$$;

-- Create function to log member removals
CREATE OR REPLACE FUNCTION public.log_board_member_removed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.board_member_audit_log (board_id, action, target_user_id, actor_user_id, old_role)
  VALUES (OLD.board_id, 'removed', OLD.user_id, auth.uid(), OLD.role::text);
  RETURN OLD;
END;
$$;

-- Create function to log role changes
CREATE OR REPLACE FUNCTION public.log_board_member_role_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO public.board_member_audit_log (board_id, action, target_user_id, actor_user_id, old_role, new_role)
    VALUES (NEW.board_id, 'role_changed', NEW.user_id, auth.uid(), OLD.role::text, NEW.role::text);
  END IF;
  RETURN NEW;
END;
$$;

-- Create triggers
CREATE TRIGGER on_board_member_added
  AFTER INSERT ON public.board_members
  FOR EACH ROW
  EXECUTE FUNCTION public.log_board_member_added();

CREATE TRIGGER on_board_member_removed
  AFTER DELETE ON public.board_members
  FOR EACH ROW
  EXECUTE FUNCTION public.log_board_member_removed();

CREATE TRIGGER on_board_member_role_changed
  AFTER UPDATE ON public.board_members
  FOR EACH ROW
  EXECUTE FUNCTION public.log_board_member_role_changed();