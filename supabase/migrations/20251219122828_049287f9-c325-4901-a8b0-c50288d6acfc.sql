-- Create table for tracking import attachments that need files uploaded
CREATE TABLE public.import_pending_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  original_attachment_id TEXT,
  original_name TEXT NOT NULL,
  original_url TEXT,
  original_size INTEGER,
  original_type TEXT,
  import_source TEXT NOT NULL DEFAULT 'unknown',
  uploaded_file_url TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.import_pending_attachments ENABLE ROW LEVEL SECURITY;

-- Policies for import_pending_attachments
CREATE POLICY "Board admins or app admins can view pending attachments"
ON public.import_pending_attachments
FOR SELECT
USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can insert pending attachments"
ON public.import_pending_attachments
FOR INSERT
WITH CHECK (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can update pending attachments"
ON public.import_pending_attachments
FOR UPDATE
USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can delete pending attachments"
ON public.import_pending_attachments
FOR DELETE
USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

-- Create index for faster queries
CREATE INDEX idx_import_pending_attachments_board ON public.import_pending_attachments(board_id);
CREATE INDEX idx_import_pending_attachments_card ON public.import_pending_attachments(card_id);