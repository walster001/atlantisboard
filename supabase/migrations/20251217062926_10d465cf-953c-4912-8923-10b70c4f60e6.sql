-- Add is_admin column to profiles
ALTER TABLE public.profiles ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

-- Update handle_new_user to make first user an admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count integer;
BEGIN
  -- Count existing profiles to determine if this is the first user
  SELECT COUNT(*) INTO user_count FROM public.profiles;
  
  INSERT INTO public.profiles (id, email, full_name, avatar_url, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'avatar_url',
    user_count = 0  -- First user becomes admin
  );
  RETURN NEW;
END;
$$;

-- Create function to check if user is app admin
CREATE OR REPLACE FUNCTION public.is_app_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = _user_id),
    false
  );
$$;

-- Update workspace RLS policies to allow app admins
DROP POLICY IF EXISTS "Workspace members can view workspaces" ON public.workspaces;
CREATE POLICY "Workspace members or admins can view workspaces" ON public.workspaces
  FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), id) OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can update workspaces" ON public.workspaces;
CREATE POLICY "Owners or admins can update workspaces" ON public.workspaces
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can delete workspaces" ON public.workspaces;
CREATE POLICY "Owners or admins can delete workspaces" ON public.workspaces
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_id OR is_app_admin(auth.uid()));

-- Update board RLS policies to allow app admins
DROP POLICY IF EXISTS "Board members can view boards" ON public.boards;
CREATE POLICY "Board members or admins can view boards" ON public.boards
  FOR SELECT TO authenticated
  USING (is_board_member(auth.uid(), id) OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Board admins can update boards" ON public.boards;
CREATE POLICY "Board admins or app admins can update boards" ON public.boards
  FOR UPDATE TO authenticated
  USING (can_edit_board(auth.uid(), id) OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Board admins can delete boards" ON public.boards;
CREATE POLICY "Board admins or app admins can delete boards" ON public.boards
  FOR DELETE TO authenticated
  USING (can_edit_board(auth.uid(), id) OR is_app_admin(auth.uid()));

-- Update board_members RLS policies for app admins
DROP POLICY IF EXISTS "Board members can view board members" ON public.board_members;
CREATE POLICY "Board members or app admins can view board members" ON public.board_members
  FOR SELECT TO authenticated
  USING (is_board_member(auth.uid(), board_id) OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins and managers can add board members" ON public.board_members;
CREATE POLICY "Board managers or app admins can add board members" ON public.board_members
  FOR INSERT TO authenticated
  WITH CHECK (can_manage_members(auth.uid(), board_id) OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update board member roles" ON public.board_members;
CREATE POLICY "Board admins or app admins can update board member roles" ON public.board_members
  FOR UPDATE TO authenticated
  USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins and managers can remove board members" ON public.board_members;
CREATE POLICY "Board managers or app admins can remove board members" ON public.board_members
  FOR DELETE TO authenticated
  USING (can_manage_members(auth.uid(), board_id) OR is_app_admin(auth.uid()));

-- Update columns RLS for app admins
DROP POLICY IF EXISTS "Board members can view columns" ON public.columns;
CREATE POLICY "Board members or app admins can view columns" ON public.columns
  FOR SELECT TO authenticated
  USING (is_board_member(auth.uid(), board_id) OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Board admins can create columns" ON public.columns;
CREATE POLICY "Board admins or app admins can create columns" ON public.columns
  FOR INSERT TO authenticated
  WITH CHECK (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Board admins can update columns" ON public.columns;
CREATE POLICY "Board admins or app admins can update columns" ON public.columns
  FOR UPDATE TO authenticated
  USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Board admins can delete columns" ON public.columns;
CREATE POLICY "Board admins or app admins can delete columns" ON public.columns
  FOR DELETE TO authenticated
  USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

-- Update cards RLS for app admins
DROP POLICY IF EXISTS "Board members can view cards" ON public.cards;
CREATE POLICY "Board members or app admins can view cards" ON public.cards
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM columns c WHERE c.id = cards.column_id AND is_board_member(auth.uid(), c.board_id)) OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Board admins can create cards" ON public.cards;
CREATE POLICY "Board admins or app admins can create cards" ON public.cards
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM columns c WHERE c.id = cards.column_id AND can_edit_board(auth.uid(), c.board_id)) OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Board admins can update cards" ON public.cards;
CREATE POLICY "Board admins or app admins can update cards" ON public.cards
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM columns c WHERE c.id = cards.column_id AND can_edit_board(auth.uid(), c.board_id)) OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Board admins can delete cards" ON public.cards;
CREATE POLICY "Board admins or app admins can delete cards" ON public.cards
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM columns c WHERE c.id = cards.column_id AND can_edit_board(auth.uid(), c.board_id)) OR is_app_admin(auth.uid()));

-- Update labels RLS for app admins
DROP POLICY IF EXISTS "Board members can view labels" ON public.labels;
CREATE POLICY "Board members or app admins can view labels" ON public.labels
  FOR SELECT TO authenticated
  USING (is_board_member(auth.uid(), board_id) OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Board admins can create labels" ON public.labels;
CREATE POLICY "Board admins or app admins can create labels" ON public.labels
  FOR INSERT TO authenticated
  WITH CHECK (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Board admins can update labels" ON public.labels;
CREATE POLICY "Board admins or app admins can update labels" ON public.labels
  FOR UPDATE TO authenticated
  USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Board admins can delete labels" ON public.labels;
CREATE POLICY "Board admins or app admins can delete labels" ON public.labels
  FOR DELETE TO authenticated
  USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

-- Update card_labels RLS for app admins
DROP POLICY IF EXISTS "Board members can view card labels" ON public.card_labels;
CREATE POLICY "Board members or app admins can view card labels" ON public.card_labels
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM cards ca JOIN columns co ON ca.column_id = co.id WHERE ca.id = card_labels.card_id AND is_board_member(auth.uid(), co.board_id)) OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Board admins can manage card labels" ON public.card_labels;
CREATE POLICY "Board admins or app admins can manage card labels" ON public.card_labels
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM cards ca JOIN columns co ON ca.column_id = co.id WHERE ca.id = card_labels.card_id AND can_edit_board(auth.uid(), co.board_id)) OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Board admins can delete card labels" ON public.card_labels;
CREATE POLICY "Board admins or app admins can delete card labels" ON public.card_labels
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM cards ca JOIN columns co ON ca.column_id = co.id WHERE ca.id = card_labels.card_id AND can_edit_board(auth.uid(), co.board_id)) OR is_app_admin(auth.uid()));

-- Update workspace_members RLS for app admins
DROP POLICY IF EXISTS "Members can view workspace members" ON public.workspace_members;
CREATE POLICY "Members or app admins can view workspace members" ON public.workspace_members
  FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id) OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can manage workspace members" ON public.workspace_members;
CREATE POLICY "Owners or app admins can manage workspace members" ON public.workspace_members
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_members.workspace_id AND workspaces.owner_id = auth.uid()) OR is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can remove workspace members" ON public.workspace_members;
CREATE POLICY "Owners or app admins can remove workspace members" ON public.workspace_members
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_members.workspace_id AND workspaces.owner_id = auth.uid()) OR is_app_admin(auth.uid()));