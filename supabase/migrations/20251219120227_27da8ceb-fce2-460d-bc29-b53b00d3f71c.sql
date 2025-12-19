-- Add priority field to cards
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS priority text DEFAULT 'none' CHECK (priority IN ('none', 'low', 'medium', 'high', 'urgent'));

-- Create card_assignees table for tracking who is assigned to a card
CREATE TABLE IF NOT EXISTS public.card_assignees (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assigned_at timestamp with time zone NOT NULL DEFAULT now(),
    assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE(card_id, user_id)
);

-- Create card_subtasks table for checklists
CREATE TABLE IF NOT EXISTS public.card_subtasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    title text NOT NULL,
    completed boolean NOT NULL DEFAULT false,
    completed_at timestamp with time zone,
    completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    position integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    checklist_name text DEFAULT 'Checklist'
);

-- Create card_attachments table
CREATE TABLE IF NOT EXISTS public.card_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    file_name text NOT NULL,
    file_url text NOT NULL,
    file_size integer,
    file_type text,
    uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.card_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for card_assignees

-- Board members can view card assignees
CREATE POLICY "Board members or app admins can view card assignees" 
ON public.card_assignees FOR SELECT 
USING (
    (EXISTS (
        SELECT 1 FROM cards ca
        JOIN columns co ON ca.column_id = co.id
        WHERE ca.id = card_assignees.card_id 
        AND is_board_member(auth.uid(), co.board_id)
    )) 
    OR is_app_admin(auth.uid())
);

-- Managers and admins can add assignees
CREATE POLICY "Board managers or app admins can add card assignees" 
ON public.card_assignees FOR INSERT 
WITH CHECK (
    (EXISTS (
        SELECT 1 FROM cards ca
        JOIN columns co ON ca.column_id = co.id
        WHERE ca.id = card_assignees.card_id 
        AND can_manage_members(auth.uid(), co.board_id)
    )) 
    OR is_app_admin(auth.uid())
);

-- Managers and admins can remove assignees
CREATE POLICY "Board managers or app admins can remove card assignees" 
ON public.card_assignees FOR DELETE 
USING (
    (EXISTS (
        SELECT 1 FROM cards ca
        JOIN columns co ON ca.column_id = co.id
        WHERE ca.id = card_assignees.card_id 
        AND can_manage_members(auth.uid(), co.board_id)
    )) 
    OR is_app_admin(auth.uid())
);

-- RLS Policies for card_subtasks

-- Board members can view subtasks
CREATE POLICY "Board members or app admins can view card subtasks" 
ON public.card_subtasks FOR SELECT 
USING (
    (EXISTS (
        SELECT 1 FROM cards ca
        JOIN columns co ON ca.column_id = co.id
        WHERE ca.id = card_subtasks.card_id 
        AND is_board_member(auth.uid(), co.board_id)
    )) 
    OR is_app_admin(auth.uid())
);

-- Board admins can create subtasks
CREATE POLICY "Board admins or app admins can create card subtasks" 
ON public.card_subtasks FOR INSERT 
WITH CHECK (
    (EXISTS (
        SELECT 1 FROM cards ca
        JOIN columns co ON ca.column_id = co.id
        WHERE ca.id = card_subtasks.card_id 
        AND can_edit_board(auth.uid(), co.board_id)
    )) 
    OR is_app_admin(auth.uid())
);

-- Board admins can update subtasks
CREATE POLICY "Board admins or app admins can update card subtasks" 
ON public.card_subtasks FOR UPDATE 
USING (
    (EXISTS (
        SELECT 1 FROM cards ca
        JOIN columns co ON ca.column_id = co.id
        WHERE ca.id = card_subtasks.card_id 
        AND can_edit_board(auth.uid(), co.board_id)
    )) 
    OR is_app_admin(auth.uid())
);

-- Board admins can delete subtasks
CREATE POLICY "Board admins or app admins can delete card subtasks" 
ON public.card_subtasks FOR DELETE 
USING (
    (EXISTS (
        SELECT 1 FROM cards ca
        JOIN columns co ON ca.column_id = co.id
        WHERE ca.id = card_subtasks.card_id 
        AND can_edit_board(auth.uid(), co.board_id)
    )) 
    OR is_app_admin(auth.uid())
);

-- RLS Policies for card_attachments

-- Board members can view attachments
CREATE POLICY "Board members or app admins can view card attachments" 
ON public.card_attachments FOR SELECT 
USING (
    (EXISTS (
        SELECT 1 FROM cards ca
        JOIN columns co ON ca.column_id = co.id
        WHERE ca.id = card_attachments.card_id 
        AND is_board_member(auth.uid(), co.board_id)
    )) 
    OR is_app_admin(auth.uid())
);

-- Only admins can add attachments
CREATE POLICY "Only board admins or app admins can add card attachments" 
ON public.card_attachments FOR INSERT 
WITH CHECK (
    (EXISTS (
        SELECT 1 FROM cards ca
        JOIN columns co ON ca.column_id = co.id
        WHERE ca.id = card_attachments.card_id 
        AND can_edit_board(auth.uid(), co.board_id)
    )) 
    OR is_app_admin(auth.uid())
);

-- Only admins can delete attachments
CREATE POLICY "Only board admins or app admins can delete card attachments" 
ON public.card_attachments FOR DELETE 
USING (
    (EXISTS (
        SELECT 1 FROM cards ca
        JOIN columns co ON ca.column_id = co.id
        WHERE ca.id = card_attachments.card_id 
        AND can_edit_board(auth.uid(), co.board_id)
    )) 
    OR is_app_admin(auth.uid())
);

-- Create storage bucket for card attachments
INSERT INTO storage.buckets (id, name, public) 
VALUES ('card-attachments', 'card-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for card attachments bucket
CREATE POLICY "Authenticated users can view card attachments" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'card-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Board admins can upload card attachments" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'card-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Board admins can delete card attachments" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'card-attachments' AND auth.role() = 'authenticated');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_card_assignees_card_id ON public.card_assignees(card_id);
CREATE INDEX IF NOT EXISTS idx_card_assignees_user_id ON public.card_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_card_subtasks_card_id ON public.card_subtasks(card_id);
CREATE INDEX IF NOT EXISTS idx_card_attachments_card_id ON public.card_attachments(card_id);