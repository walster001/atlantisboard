-- Create table for pending assignee mappings from imports
CREATE TABLE public.import_pending_assignees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  original_member_id TEXT,
  original_member_name TEXT NOT NULL,
  original_username TEXT,
  mapped_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  import_source TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES public.profiles(id)
);

-- Enable RLS
ALTER TABLE public.import_pending_assignees ENABLE ROW LEVEL SECURITY;

-- Only board admins or app admins can view pending assignees
CREATE POLICY "Board admins or app admins can view pending assignees"
ON public.import_pending_assignees
FOR SELECT
USING (
  can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid())
);

-- Only board admins or app admins can insert pending assignees
CREATE POLICY "Board admins or app admins can insert pending assignees"
ON public.import_pending_assignees
FOR INSERT
WITH CHECK (
  can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid())
);

-- Only board admins or app admins can update pending assignees
CREATE POLICY "Board admins or app admins can update pending assignees"
ON public.import_pending_assignees
FOR UPDATE
USING (
  can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid())
);

-- Only board admins or app admins can delete pending assignees
CREATE POLICY "Board admins or app admins can delete pending assignees"
ON public.import_pending_assignees
FOR DELETE
USING (
  can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid())
);

-- Create index for faster lookups
CREATE INDEX idx_import_pending_assignees_board ON public.import_pending_assignees(board_id);
CREATE INDEX idx_import_pending_assignees_resolved ON public.import_pending_assignees(resolved_at) WHERE resolved_at IS NULL;