-- Create enum for board roles
CREATE TYPE public.board_role AS ENUM ('admin', 'manager', 'viewer');

-- Profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workspaces (like Trello workspaces)
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workspace members
CREATE TABLE public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

-- Boards within workspaces
CREATE TABLE public.boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  background_color TEXT DEFAULT '#0079bf',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Board members with role-based permissions
CREATE TABLE public.board_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role board_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(board_id, user_id)
);

-- Columns within boards
CREATE TABLE public.columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cards within columns
CREATE TABLE public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id UUID NOT NULL REFERENCES public.columns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  due_date TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Labels for cards
CREATE TABLE public.labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL
);

-- Card-label junction table
CREATE TABLE public.card_labels (
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES public.labels(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, label_id)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_labels ENABLE ROW LEVEL SECURITY;

-- Security definer function to check board role (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.get_board_role(_user_id UUID, _board_id UUID)
RETURNS board_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.board_members
  WHERE user_id = _user_id AND board_id = _board_id
$$;

-- Function to check if user is workspace member
CREATE OR REPLACE FUNCTION public.is_workspace_member(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id AND workspace_id = _workspace_id
  ) OR EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = _workspace_id AND owner_id = _user_id
  )
$$;

-- Function to check if user is board member
CREATE OR REPLACE FUNCTION public.is_board_member(_user_id UUID, _board_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.board_members
    WHERE user_id = _user_id AND board_id = _board_id
  )
$$;

-- Function to check if user can edit board (admin only)
CREATE OR REPLACE FUNCTION public.can_edit_board(_user_id UUID, _board_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.board_members
    WHERE user_id = _user_id AND board_id = _board_id AND role = 'admin'
  )
$$;

-- Function to check if user can manage members (admin or manager)
CREATE OR REPLACE FUNCTION public.can_manage_members(_user_id UUID, _board_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.board_members
    WHERE user_id = _user_id AND board_id = _board_id AND role IN ('admin', 'manager')
  )
$$;

-- RLS Policies

-- Profiles: Users can see all profiles, update their own
CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Workspaces: Members can view, owners can manage
CREATE POLICY "Workspace members can view workspaces" ON public.workspaces
  FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), id));
CREATE POLICY "Users can create workspaces" ON public.workspaces
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update workspaces" ON public.workspaces
  FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners can delete workspaces" ON public.workspaces
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- Workspace members: Owners manage, members can view
CREATE POLICY "Members can view workspace members" ON public.workspace_members
  FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Owners can manage workspace members" ON public.workspace_members
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = workspace_id AND owner_id = auth.uid())
  );
CREATE POLICY "Owners can remove workspace members" ON public.workspace_members
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = workspace_id AND owner_id = auth.uid())
  );

-- Boards: Members can view, admins can manage
CREATE POLICY "Board members can view boards" ON public.boards
  FOR SELECT TO authenticated USING (public.is_board_member(auth.uid(), id));
CREATE POLICY "Workspace members can create boards" ON public.boards
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Board admins can update boards" ON public.boards
  FOR UPDATE TO authenticated USING (public.can_edit_board(auth.uid(), id));
CREATE POLICY "Board admins can delete boards" ON public.boards
  FOR DELETE TO authenticated USING (public.can_edit_board(auth.uid(), id));

-- Board members: Admins and managers can manage
CREATE POLICY "Board members can view board members" ON public.board_members
  FOR SELECT TO authenticated USING (public.is_board_member(auth.uid(), board_id));
CREATE POLICY "Admins and managers can add board members" ON public.board_members
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_members(auth.uid(), board_id));
CREATE POLICY "Admins and managers can remove board members" ON public.board_members
  FOR DELETE TO authenticated USING (public.can_manage_members(auth.uid(), board_id));
CREATE POLICY "Admins can update board member roles" ON public.board_members
  FOR UPDATE TO authenticated USING (public.can_edit_board(auth.uid(), board_id));

-- Columns: Admins can manage
CREATE POLICY "Board members can view columns" ON public.columns
  FOR SELECT TO authenticated USING (public.is_board_member(auth.uid(), board_id));
CREATE POLICY "Board admins can create columns" ON public.columns
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_board(auth.uid(), board_id));
CREATE POLICY "Board admins can update columns" ON public.columns
  FOR UPDATE TO authenticated USING (public.can_edit_board(auth.uid(), board_id));
CREATE POLICY "Board admins can delete columns" ON public.columns
  FOR DELETE TO authenticated USING (public.can_edit_board(auth.uid(), board_id));

-- Cards: Admins can manage
CREATE POLICY "Board members can view cards" ON public.cards
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.columns c WHERE c.id = column_id AND public.is_board_member(auth.uid(), c.board_id))
  );
CREATE POLICY "Board admins can create cards" ON public.cards
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.columns c WHERE c.id = column_id AND public.can_edit_board(auth.uid(), c.board_id))
  );
CREATE POLICY "Board admins can update cards" ON public.cards
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.columns c WHERE c.id = column_id AND public.can_edit_board(auth.uid(), c.board_id))
  );
CREATE POLICY "Board admins can delete cards" ON public.cards
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.columns c WHERE c.id = column_id AND public.can_edit_board(auth.uid(), c.board_id))
  );

-- Labels: Admins can manage
CREATE POLICY "Board members can view labels" ON public.labels
  FOR SELECT TO authenticated USING (public.is_board_member(auth.uid(), board_id));
CREATE POLICY "Board admins can create labels" ON public.labels
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_board(auth.uid(), board_id));
CREATE POLICY "Board admins can update labels" ON public.labels
  FOR UPDATE TO authenticated USING (public.can_edit_board(auth.uid(), board_id));
CREATE POLICY "Board admins can delete labels" ON public.labels
  FOR DELETE TO authenticated USING (public.can_edit_board(auth.uid(), board_id));

-- Card labels: Admins can manage
CREATE POLICY "Board members can view card labels" ON public.card_labels
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.cards ca JOIN public.columns co ON ca.column_id = co.id WHERE ca.id = card_id AND public.is_board_member(auth.uid(), co.board_id))
  );
CREATE POLICY "Board admins can manage card labels" ON public.card_labels
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.cards ca JOIN public.columns co ON ca.column_id = co.id WHERE ca.id = card_id AND public.can_edit_board(auth.uid(), co.board_id))
  );
CREATE POLICY "Board admins can delete card labels" ON public.card_labels
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.cards ca JOIN public.columns co ON ca.column_id = co.id WHERE ca.id = card_id AND public.can_edit_board(auth.uid(), co.board_id))
  );

-- Trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_boards_updated_at BEFORE UPDATE ON public.boards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();