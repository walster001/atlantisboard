-- =====================================================
-- AtlantisBoard Complete Database Schema
-- Version: 1.0.0
-- Generated for standalone/self-hosted deployment
-- =====================================================

-- =====================================================
-- ENUMS
-- =====================================================

-- Board member roles
CREATE TYPE public.board_role AS ENUM ('admin', 'manager', 'viewer');

-- Permission keys for granular access control
CREATE TYPE public.permission_key AS ENUM (
    'app.admin.access',
    'app.admin.branding.view',
    'app.admin.branding.edit',
    'app.admin.fonts.view',
    'app.admin.fonts.edit',
    'app.admin.login.view',
    'app.admin.login.edit',
    'app.themes.create',
    'app.themes.edit',
    'app.themes.delete',
    'app.workspace.create',
    'app.workspace.edit',
    'app.workspace.delete',
    'app.board.create',
    'app.board.import',
    'board.view',
    'board.edit',
    'board.delete',
    'board.move',
    'board.settings.button',
    'board.settings.members',
    'board.settings.theme',
    'board.settings.labels',
    'board.settings.audit',
    'board.background.edit',
    'board.theme.assign',
    'board.members.view',
    'board.members.add',
    'board.members.remove',
    'board.members.role.change',
    'board.invite.create',
    'board.invite.delete',
    'column.create',
    'column.edit',
    'column.delete',
    'column.reorder',
    'column.color.edit',
    'card.create',
    'card.edit',
    'card.delete',
    'card.move',
    'card.color.edit',
    'card.duedate.edit',
    'label.create',
    'label.edit',
    'label.delete',
    'label.assign',
    'label.unassign',
    'attachment.view',
    'attachment.upload',
    'attachment.download',
    'attachment.delete',
    'subtask.view',
    'subtask.create',
    'subtask.toggle',
    'subtask.delete'
);

-- =====================================================
-- TABLES
-- =====================================================

-- User profiles (extends auth.users)
CREATE TABLE public.profiles (
    id uuid NOT NULL PRIMARY KEY,
    email text NOT NULL,
    full_name text,
    avatar_url text,
    is_admin boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Application-wide settings
CREATE TABLE public.app_settings (
    id text NOT NULL DEFAULT 'default'::text PRIMARY KEY,
    custom_login_logo_enabled boolean NOT NULL DEFAULT false,
    custom_login_logo_url text,
    custom_login_logo_size text NOT NULL DEFAULT 'medium'::text,
    custom_home_logo_enabled boolean NOT NULL DEFAULT false,
    custom_home_logo_url text,
    custom_home_logo_size integer NOT NULL DEFAULT 40,
    custom_board_logo_enabled boolean NOT NULL DEFAULT false,
    custom_board_logo_url text,
    custom_board_logo_size integer NOT NULL DEFAULT 40,
    custom_app_name_enabled boolean NOT NULL DEFAULT false,
    custom_app_name text,
    custom_app_name_size integer NOT NULL DEFAULT 24,
    custom_app_name_color text NOT NULL DEFAULT '#000000'::text,
    custom_app_name_font text DEFAULT 'default'::text,
    custom_global_app_name_enabled boolean NOT NULL DEFAULT false,
    custom_global_app_name text,
    custom_tagline_enabled boolean NOT NULL DEFAULT false,
    custom_tagline text,
    custom_tagline_size integer NOT NULL DEFAULT 14,
    custom_tagline_color text NOT NULL DEFAULT '#6b7280'::text,
    custom_tagline_font text DEFAULT 'default'::text,
    custom_login_background_enabled boolean NOT NULL DEFAULT false,
    custom_login_background_type text NOT NULL DEFAULT 'color'::text,
    custom_login_background_color text NOT NULL DEFAULT '#f3f4f6'::text,
    custom_login_background_image_url text,
    custom_login_box_background_color text NOT NULL DEFAULT '#ffffff'::text,
    custom_google_button_background_color text NOT NULL DEFAULT '#ffffff'::text,
    custom_google_button_text_color text NOT NULL DEFAULT '#000000'::text,
    login_style text NOT NULL DEFAULT 'google_only'::text,
    audit_log_retention_days integer,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Custom fonts for branding
CREATE TABLE public.custom_fonts (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    font_url text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Board themes for visual customization
CREATE TABLE public.board_themes (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    navbar_color text NOT NULL DEFAULT '#0079bf'::text,
    column_color text NOT NULL DEFAULT '#ffffff'::text,
    board_icon_color text NOT NULL DEFAULT '#ffffff'::text,
    homepage_board_color text NOT NULL DEFAULT '#0079bf'::text,
    scrollbar_color text NOT NULL DEFAULT '#888888'::text,
    scrollbar_track_color text NOT NULL DEFAULT '#f1f1f1'::text,
    card_window_color text NOT NULL DEFAULT '#ffffff'::text,
    card_window_text_color text NOT NULL DEFAULT '#000000'::text,
    card_window_button_color text NOT NULL DEFAULT '#0079bf'::text,
    card_window_button_text_color text NOT NULL DEFAULT '#ffffff'::text,
    card_window_button_hover_color text DEFAULT '#005a8c'::text,
    card_window_button_hover_text_color text DEFAULT '#ffffff'::text,
    card_window_intelligent_contrast boolean NOT NULL DEFAULT false,
    default_card_color text,
    is_default boolean NOT NULL DEFAULT false,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Workspaces (containers for boards)
CREATE TABLE public.workspaces (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    owner_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Workspace members
CREATE TABLE public.workspace_members (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(workspace_id, user_id)
);

-- Boards (Kanban boards)
CREATE TABLE public.boards (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    background_color text DEFAULT '#0079bf'::text,
    theme_id uuid,
    position integer NOT NULL DEFAULT 0,
    audit_log_retention_days integer,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Board members
CREATE TABLE public.board_members (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    board_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.board_role NOT NULL DEFAULT 'viewer'::public.board_role,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(board_id, user_id)
);

-- Board member audit log
CREATE TABLE public.board_member_audit_log (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    board_id uuid NOT NULL,
    action text NOT NULL,
    target_user_id uuid NOT NULL,
    actor_user_id uuid,
    old_role text,
    new_role text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Board invite tokens
CREATE TABLE public.board_invite_tokens (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    board_id uuid NOT NULL,
    token text NOT NULL UNIQUE,
    link_type text NOT NULL DEFAULT 'one_time'::text,
    created_by uuid NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + interval '24 hours'),
    used_at timestamp with time zone,
    used_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Custom roles for fine-grained permissions
CREATE TABLE public.custom_roles (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    is_system boolean NOT NULL DEFAULT false,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Role permissions mapping
CREATE TABLE public.role_permissions (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    role_id uuid,
    permission_key public.permission_key NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(role_id, permission_key)
);

-- Board member custom roles assignment
CREATE TABLE public.board_member_custom_roles (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    board_id uuid NOT NULL,
    user_id uuid NOT NULL,
    custom_role_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(board_id, user_id, custom_role_id)
);

-- Columns (Kanban columns)
CREATE TABLE public.columns (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    board_id uuid NOT NULL,
    title text NOT NULL,
    position integer NOT NULL DEFAULT 0,
    color text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Cards (Kanban cards)
CREATE TABLE public.cards (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    column_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    position integer NOT NULL DEFAULT 0,
    color text,
    priority text DEFAULT 'none'::text,
    due_date timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Card assignees
CREATE TABLE public.card_assignees (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    card_id uuid NOT NULL,
    user_id uuid NOT NULL,
    assigned_by uuid,
    assigned_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(card_id, user_id)
);

-- Card subtasks/checklists
CREATE TABLE public.card_subtasks (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    card_id uuid NOT NULL,
    title text NOT NULL,
    completed boolean NOT NULL DEFAULT false,
    completed_at timestamp with time zone,
    completed_by uuid,
    position integer NOT NULL DEFAULT 0,
    checklist_name text DEFAULT 'Checklist'::text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Card attachments
CREATE TABLE public.card_attachments (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    card_id uuid NOT NULL,
    file_name text NOT NULL,
    file_url text NOT NULL,
    file_type text,
    file_size integer,
    uploaded_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Labels
CREATE TABLE public.labels (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    board_id uuid NOT NULL,
    name text NOT NULL,
    color text NOT NULL
);

-- Card labels (many-to-many)
CREATE TABLE public.card_labels (
    card_id uuid NOT NULL,
    label_id uuid NOT NULL,
    PRIMARY KEY (card_id, label_id)
);

-- Import pending assignees (for board imports)
CREATE TABLE public.import_pending_assignees (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    board_id uuid NOT NULL,
    card_id uuid NOT NULL,
    original_member_name text NOT NULL,
    original_member_id text,
    original_username text,
    mapped_user_id uuid,
    import_source text NOT NULL DEFAULT 'unknown'::text,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Import pending attachments (for board imports)
CREATE TABLE public.import_pending_attachments (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    board_id uuid NOT NULL,
    card_id uuid NOT NULL,
    original_name text NOT NULL,
    original_url text,
    original_type text,
    original_size integer,
    original_attachment_id text,
    uploaded_file_url text,
    import_source text NOT NULL DEFAULT 'unknown'::text,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- MySQL configuration for external email verification
CREATE TABLE public.mysql_config (
    id text NOT NULL DEFAULT 'default'::text PRIMARY KEY,
    db_host_encrypted text,
    db_name_encrypted text,
    db_user_encrypted text,
    db_password_encrypted text,
    iv text,
    verification_query text DEFAULT 'SELECT 1 FROM users WHERE email = ? LIMIT 1'::text,
    is_configured boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- =====================================================
-- FOREIGN KEYS
-- =====================================================

ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.board_themes ADD CONSTRAINT board_themes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id);

ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.boards ADD CONSTRAINT boards_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.boards ADD CONSTRAINT boards_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.board_themes(id) ON DELETE SET NULL;

ALTER TABLE public.board_members ADD CONSTRAINT board_members_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;
ALTER TABLE public.board_members ADD CONSTRAINT board_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.board_member_audit_log ADD CONSTRAINT board_member_audit_log_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;

ALTER TABLE public.board_invite_tokens ADD CONSTRAINT board_invite_tokens_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;
ALTER TABLE public.board_invite_tokens ADD CONSTRAINT board_invite_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);
ALTER TABLE public.board_invite_tokens ADD CONSTRAINT board_invite_tokens_used_by_fkey FOREIGN KEY (used_by) REFERENCES public.profiles(id);

ALTER TABLE public.custom_roles ADD CONSTRAINT custom_roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.custom_roles(id) ON DELETE CASCADE;

ALTER TABLE public.board_member_custom_roles ADD CONSTRAINT board_member_custom_roles_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;
ALTER TABLE public.board_member_custom_roles ADD CONSTRAINT board_member_custom_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.board_member_custom_roles ADD CONSTRAINT board_member_custom_roles_custom_role_id_fkey FOREIGN KEY (custom_role_id) REFERENCES public.custom_roles(id) ON DELETE CASCADE;

ALTER TABLE public.columns ADD CONSTRAINT columns_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;

ALTER TABLE public.cards ADD CONSTRAINT cards_column_id_fkey FOREIGN KEY (column_id) REFERENCES public.columns(id) ON DELETE CASCADE;
ALTER TABLE public.cards ADD CONSTRAINT cards_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE public.card_assignees ADD CONSTRAINT card_assignees_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;
ALTER TABLE public.card_assignees ADD CONSTRAINT card_assignees_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.card_assignees ADD CONSTRAINT card_assignees_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id);

ALTER TABLE public.card_subtasks ADD CONSTRAINT card_subtasks_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;
ALTER TABLE public.card_subtasks ADD CONSTRAINT card_subtasks_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.profiles(id);

ALTER TABLE public.card_attachments ADD CONSTRAINT card_attachments_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;
ALTER TABLE public.card_attachments ADD CONSTRAINT card_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id);

ALTER TABLE public.labels ADD CONSTRAINT labels_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;

ALTER TABLE public.card_labels ADD CONSTRAINT card_labels_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;
ALTER TABLE public.card_labels ADD CONSTRAINT card_labels_label_id_fkey FOREIGN KEY (label_id) REFERENCES public.labels(id) ON DELETE CASCADE;

ALTER TABLE public.import_pending_assignees ADD CONSTRAINT import_pending_assignees_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;
ALTER TABLE public.import_pending_assignees ADD CONSTRAINT import_pending_assignees_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;
ALTER TABLE public.import_pending_assignees ADD CONSTRAINT import_pending_assignees_mapped_user_id_fkey FOREIGN KEY (mapped_user_id) REFERENCES public.profiles(id);
ALTER TABLE public.import_pending_assignees ADD CONSTRAINT import_pending_assignees_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.profiles(id);

ALTER TABLE public.import_pending_attachments ADD CONSTRAINT import_pending_attachments_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;
ALTER TABLE public.import_pending_attachments ADD CONSTRAINT import_pending_attachments_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;
ALTER TABLE public.import_pending_attachments ADD CONSTRAINT import_pending_attachments_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.profiles(id);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_workspace_members_workspace_id ON public.workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user_id ON public.workspace_members(user_id);
CREATE INDEX idx_boards_workspace_id ON public.boards(workspace_id);
CREATE INDEX idx_board_members_board_id ON public.board_members(board_id);
CREATE INDEX idx_board_members_user_id ON public.board_members(user_id);
CREATE INDEX idx_columns_board_id ON public.columns(board_id);
CREATE INDEX idx_cards_column_id ON public.cards(column_id);
CREATE INDEX idx_card_labels_card_id ON public.card_labels(card_id);
CREATE INDEX idx_card_labels_label_id ON public.card_labels(label_id);
CREATE INDEX idx_card_assignees_card_id ON public.card_assignees(card_id);
CREATE INDEX idx_card_subtasks_card_id ON public.card_subtasks(card_id);
CREATE INDEX idx_card_attachments_card_id ON public.card_attachments(card_id);
CREATE INDEX idx_labels_board_id ON public.labels(board_id);
CREATE INDEX idx_board_member_audit_log_board_id ON public.board_member_audit_log(board_id);
CREATE INDEX idx_board_invite_tokens_token ON public.board_invite_tokens(token);
CREATE INDEX idx_role_permissions_role_id ON public.role_permissions(role_id);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Check if user is app admin
CREATE OR REPLACE FUNCTION public.is_app_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = _user_id),
    false
  );
$$;

-- Check if user is board member
CREATE OR REPLACE FUNCTION public.is_board_member(_user_id uuid, _board_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.board_members
    WHERE user_id = _user_id AND board_id = _board_id
  )
$$;

-- Check if user can edit board (is board admin)
CREATE OR REPLACE FUNCTION public.can_edit_board(_user_id uuid, _board_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.board_members
    WHERE user_id = _user_id AND board_id = _board_id AND role = 'admin'
  )
$$;

-- Check if user can manage members (is board admin or manager)
CREATE OR REPLACE FUNCTION public.can_manage_members(_user_id uuid, _board_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.board_members
    WHERE user_id = _user_id AND board_id = _board_id AND role IN ('admin', 'manager')
  )
$$;

-- Check if user is workspace member
CREATE OR REPLACE FUNCTION public.is_workspace_member(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
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

-- Check if user is board member in workspace
CREATE OR REPLACE FUNCTION public.is_board_member_in_workspace(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_members bm
    JOIN boards b ON bm.board_id = b.id
    WHERE bm.user_id = _user_id 
      AND b.workspace_id = _workspace_id
  )
$$;

-- Get user's board role
CREATE OR REPLACE FUNCTION public.get_board_role(_user_id uuid, _board_id uuid)
RETURNS board_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.board_members
  WHERE user_id = _user_id AND board_id = _board_id
$$;

-- Check if user can create board invite
CREATE OR REPLACE FUNCTION public.can_create_board_invite(_user_id uuid, _board_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT can_edit_board(_user_id, _board_id)
$$;

-- Check if users share a board
CREATE OR REPLACE FUNCTION public.shares_board_with(_viewer_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_members bm1
    JOIN board_members bm2 ON bm1.board_id = bm2.board_id
    WHERE bm1.user_id = _viewer_id 
      AND bm2.user_id = _profile_id
  )
$$;

-- Check if users share a workspace
CREATE OR REPLACE FUNCTION public.shares_workspace_with(_viewer_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members wm1
    JOIN workspace_members wm2 ON wm1.workspace_id = wm2.workspace_id
    WHERE wm1.user_id = _viewer_id
      AND wm2.user_id = _profile_id
  ) OR EXISTS (
    SELECT 1 FROM workspaces w
    JOIN workspace_members wm ON w.id = wm.workspace_id
    WHERE w.owner_id = _viewer_id
      AND wm.user_id = _profile_id
  ) OR EXISTS (
    SELECT 1 FROM workspaces w
    JOIN workspace_members wm ON w.id = wm.workspace_id
    WHERE w.owner_id = _profile_id
      AND wm.user_id = _viewer_id
  ) OR EXISTS (
    SELECT 1 FROM workspaces w1, workspaces w2
    WHERE w1.owner_id = _viewer_id
      AND w2.owner_id = _profile_id
  )
$$;

-- =====================================================
-- PERMISSION FUNCTIONS
-- =====================================================

-- Check if user has a specific permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission permission_key, _board_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _is_app_admin boolean;
    _board_role board_role;
    _has_custom_permission boolean;
BEGIN
    -- Check if user is App Admin (has ALL permissions globally)
    SELECT is_app_admin(_user_id) INTO _is_app_admin;
    IF _is_app_admin THEN
        RETURN true;
    END IF;
    
    -- App-level permissions require App Admin status
    IF _permission::text LIKE 'app.%' THEN
        RETURN false;
    END IF;
    
    -- Board-level permissions require board context
    IF _board_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Check for custom role permissions first
    SELECT EXISTS (
        SELECT 1
        FROM board_member_custom_roles bmcr
        JOIN role_permissions rp ON rp.role_id = bmcr.custom_role_id
        WHERE bmcr.board_id = _board_id
          AND bmcr.user_id = _user_id
          AND rp.permission_key = _permission
    ) INTO _has_custom_permission;
    
    IF _has_custom_permission THEN
        RETURN true;
    END IF;
    
    -- Get user's board role
    SELECT role INTO _board_role
    FROM board_members
    WHERE board_id = _board_id AND user_id = _user_id;
    
    IF _board_role IS NULL THEN
        RETURN false;
    END IF;
    
    -- Board Admin: has all BOARD-LEVEL permissions
    CASE _board_role
        WHEN 'admin' THEN
            RETURN _permission::text NOT LIKE 'app.%';
        WHEN 'manager' THEN
            RETURN _permission IN (
                'board.view', 'board.settings.button', 'board.settings.members',
                'board.members.view', 'board.members.add', 'board.members.remove',
                'board.invite.create', 'board.invite.delete',
                'attachment.view', 'attachment.download',
                'subtask.view'
            );
        WHEN 'viewer' THEN
            RETURN _permission IN (
                'board.view', 'board.members.view',
                'attachment.view', 'attachment.download',
                'subtask.view'
            );
        ELSE
            RETURN false;
    END CASE;
END;
$$;

-- Get all permissions for a user
CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id uuid, _board_id uuid DEFAULT NULL)
RETURNS permission_key[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _is_app_admin boolean;
    _board_role board_role;
    _permissions permission_key[] := '{}';
    _all_permissions permission_key[] := ARRAY[
        'app.admin.access', 'app.admin.branding.view', 'app.admin.branding.edit',
        'app.admin.fonts.view', 'app.admin.fonts.edit', 'app.admin.login.view', 'app.admin.login.edit',
        'app.themes.create', 'app.themes.edit', 'app.themes.delete',
        'app.workspace.create', 'app.workspace.edit', 'app.workspace.delete',
        'app.board.create', 'app.board.import',
        'board.view', 'board.edit', 'board.delete', 'board.move',
        'board.settings.button', 'board.settings.members', 'board.settings.theme', 'board.settings.labels', 'board.settings.audit',
        'board.background.edit', 'board.theme.assign',
        'board.members.view', 'board.members.add', 'board.members.remove', 'board.members.role.change',
        'board.invite.create', 'board.invite.delete',
        'column.create', 'column.edit', 'column.delete', 'column.reorder', 'column.color.edit',
        'card.create', 'card.edit', 'card.delete', 'card.move', 'card.color.edit', 'card.duedate.edit',
        'label.create', 'label.edit', 'label.delete', 'label.assign', 'label.unassign',
        'attachment.view', 'attachment.upload', 'attachment.download', 'attachment.delete',
        'subtask.view', 'subtask.create', 'subtask.toggle', 'subtask.delete'
    ]::permission_key[];
    _board_permissions permission_key[] := ARRAY[
        'board.view', 'board.edit', 'board.delete', 'board.move',
        'board.settings.button', 'board.settings.members', 'board.settings.theme', 'board.settings.labels', 'board.settings.audit',
        'board.background.edit', 'board.theme.assign',
        'board.members.view', 'board.members.add', 'board.members.remove', 'board.members.role.change',
        'board.invite.create', 'board.invite.delete',
        'column.create', 'column.edit', 'column.delete', 'column.reorder', 'column.color.edit',
        'card.create', 'card.edit', 'card.delete', 'card.move', 'card.color.edit', 'card.duedate.edit',
        'label.create', 'label.edit', 'label.delete', 'label.assign', 'label.unassign',
        'attachment.view', 'attachment.upload', 'attachment.download', 'attachment.delete',
        'subtask.view', 'subtask.create', 'subtask.toggle', 'subtask.delete'
    ]::permission_key[];
    _perm permission_key;
BEGIN
    SELECT is_app_admin(_user_id) INTO _is_app_admin;
    IF _is_app_admin THEN
        RETURN _all_permissions;
    END IF;
    
    IF _board_id IS NOT NULL THEN
        SELECT role INTO _board_role
        FROM board_members
        WHERE board_id = _board_id AND user_id = _user_id;
        
        IF _board_role = 'admin' THEN
            RETURN _board_permissions;
        END IF;
    END IF;
    
    FOREACH _perm IN ARRAY _all_permissions LOOP
        IF has_permission(_user_id, _perm, _board_id) THEN
            _permissions := array_append(_permissions, _perm);
        END IF;
    END LOOP;
    
    RETURN _permissions;
END;
$$;

-- Check permission for current user
CREATE OR REPLACE FUNCTION public.check_permission(_permission permission_key, _board_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT has_permission(auth.uid(), _permission, _board_id);
$$;

-- =====================================================
-- DATA FUNCTIONS
-- =====================================================

-- Get home page data
CREATE OR REPLACE FUNCTION public.get_home_data(_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'workspaces', COALESCE((
      SELECT json_agg(w ORDER BY w.created_at DESC)
      FROM workspaces w
      WHERE is_workspace_member(_user_id, w.id) 
        OR is_board_member_in_workspace(_user_id, w.id) 
        OR is_app_admin(_user_id)
    ), '[]'::json),
    'boards', COALESCE((
      SELECT json_agg(b ORDER BY b.workspace_id, b.position, b.created_at DESC)
      FROM boards b
      WHERE is_board_member(_user_id, b.id) OR is_app_admin(_user_id)
    ), '[]'::json),
    'board_roles', COALESCE((
      SELECT json_object_agg(bm.board_id, bm.role)
      FROM board_members bm
      WHERE bm.user_id = _user_id
    ), '{}'::json)
  ) INTO result;

  RETURN result;
END;
$$;

-- Get board data
CREATE OR REPLACE FUNCTION public.get_board_data(_board_id uuid, _user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  board_record record;
  user_role board_role;
  is_preview_mode boolean;
BEGIN
  is_preview_mode := _user_id = '00000000-0000-0000-0000-000000000000'::uuid;

  IF NOT is_preview_mode AND NOT (is_board_member(_user_id, _board_id) OR is_app_admin(_user_id)) THEN
    RETURN json_build_object('error', 'Access denied');
  END IF;

  SELECT * INTO board_record FROM boards WHERE id = _board_id;
  
  IF board_record IS NULL THEN
    RETURN json_build_object('error', 'Board not found');
  END IF;

  IF NOT is_preview_mode THEN
    SELECT role INTO user_role FROM board_members WHERE board_id = _board_id AND user_id = _user_id;
  ELSE
    user_role := 'admin'::board_role;
  END IF;

  SELECT json_build_object(
    'board', json_build_object(
      'id', board_record.id,
      'name', board_record.name,
      'description', board_record.description,
      'background_color', board_record.background_color,
      'workspace_id', board_record.workspace_id
    ),
    'user_role', user_role,
    'columns', COALESCE((
      SELECT json_agg(c ORDER BY c.position)
      FROM columns c
      WHERE c.board_id = _board_id
    ), '[]'::json),
    'cards', COALESCE((
      SELECT json_agg(ca)
      FROM cards ca
      WHERE ca.column_id IN (SELECT id FROM columns WHERE board_id = _board_id)
    ), '[]'::json),
    'labels', COALESCE((
      SELECT json_agg(l)
      FROM labels l
      WHERE l.board_id = _board_id
    ), '[]'::json),
    'card_labels', COALESCE((
      SELECT json_agg(cl)
      FROM card_labels cl
      WHERE cl.card_id IN (
        SELECT ca.id FROM cards ca
        WHERE ca.column_id IN (SELECT id FROM columns WHERE board_id = _board_id)
      )
    ), '[]'::json),
    'members', COALESCE((
      SELECT json_agg(json_build_object(
        'user_id', bm.user_id,
        'role', bm.role,
        'profiles', json_build_object(
          'id', p.id,
          'email', CASE 
            WHEN is_preview_mode THEN p.email
            WHEN _user_id = p.id THEN p.email
            WHEN is_app_admin(_user_id) THEN p.email
            ELSE NULL
          END,
          'full_name', p.full_name,
          'avatar_url', p.avatar_url
        )
      ))
      FROM board_members bm
      JOIN profiles p ON bm.user_id = p.id
      WHERE bm.board_id = _board_id
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

-- Get auth page data (public)
CREATE OR REPLACE FUNCTION public.get_auth_page_data()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'settings', (
      SELECT row_to_json(s.*)
      FROM (
        SELECT 
          custom_login_logo_enabled,
          custom_login_logo_url,
          custom_login_logo_size,
          custom_app_name_enabled,
          custom_app_name,
          custom_app_name_size,
          custom_app_name_color,
          custom_app_name_font,
          custom_tagline_enabled,
          custom_tagline,
          custom_tagline_size,
          custom_tagline_color,
          custom_tagline_font,
          custom_login_background_enabled,
          custom_login_background_type,
          custom_login_background_color,
          custom_login_background_image_url,
          custom_login_box_background_color,
          custom_google_button_background_color,
          custom_google_button_text_color,
          login_style
        FROM app_settings
        WHERE id = 'default'
      ) s
    ),
    'fonts', COALESCE(
      (SELECT json_agg(row_to_json(f.*))
       FROM (SELECT id, name, font_url FROM custom_fonts) f),
      '[]'::json
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Get board member profiles
CREATE OR REPLACE FUNCTION public.get_board_member_profiles(_board_id uuid)
RETURNS TABLE(user_id uuid, role text, id uuid, email text, full_name text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    bm.user_id,
    bm.role::text,
    p.id,
    CASE 
      WHEN auth.uid() = p.id THEN p.email
      WHEN is_app_admin(auth.uid()) THEN p.email
      ELSE NULL
    END AS email,
    p.full_name,
    p.avatar_url
  FROM board_members bm
  JOIN profiles p ON bm.user_id = p.id
  WHERE bm.board_id = _board_id
    AND (is_board_member(auth.uid(), _board_id) OR is_app_admin(auth.uid()))
$$;

-- Find user by email (for adding to boards)
CREATE OR REPLACE FUNCTION public.find_user_by_email(_email text, _board_id uuid)
RETURNS TABLE(id uuid, email text, full_name text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.email, p.full_name, p.avatar_url
  FROM profiles p
  WHERE p.email = _email
    AND (can_manage_members(auth.uid(), _board_id) OR is_app_admin(auth.uid()))
$$;

-- =====================================================
-- BATCH UPDATE FUNCTIONS
-- =====================================================

-- Batch update card positions
CREATE OR REPLACE FUNCTION public.batch_update_card_positions(_user_id uuid, _updates jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  update_item jsonb;
  card_record record;
  board_id_check uuid;
BEGIN
  FOR update_item IN SELECT * FROM jsonb_array_elements(_updates)
  LOOP
    SELECT c.board_id INTO board_id_check
    FROM cards ca
    JOIN columns c ON ca.column_id = c.id
    WHERE ca.id = (update_item->>'id')::uuid;

    IF NOT (can_edit_board(_user_id, board_id_check) OR is_app_admin(_user_id)) THEN
      RETURN json_build_object('error', 'Access denied for card ' || (update_item->>'id'));
    END IF;
  END LOOP;

  FOR update_item IN SELECT * FROM jsonb_array_elements(_updates)
  LOOP
    UPDATE cards
    SET 
      column_id = COALESCE((update_item->>'column_id')::uuid, column_id),
      position = COALESCE((update_item->>'position')::integer, position),
      updated_at = now()
    WHERE id = (update_item->>'id')::uuid;
  END LOOP;

  RETURN json_build_object('success', true, 'updated', jsonb_array_length(_updates));
END;
$$;

-- Batch update column positions
CREATE OR REPLACE FUNCTION public.batch_update_column_positions(_user_id uuid, _board_id uuid, _updates jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  update_item jsonb;
BEGIN
  IF NOT (can_edit_board(_user_id, _board_id) OR is_app_admin(_user_id)) THEN
    RETURN json_build_object('error', 'Access denied');
  END IF;

  FOR update_item IN SELECT * FROM jsonb_array_elements(_updates)
  LOOP
    UPDATE columns
    SET position = (update_item->>'position')::integer
    WHERE id = (update_item->>'id')::uuid AND board_id = _board_id;
  END LOOP;

  RETURN json_build_object('success', true, 'updated', jsonb_array_length(_updates));
END;
$$;

-- Batch update board positions
CREATE OR REPLACE FUNCTION public.batch_update_board_positions(_user_id uuid, _workspace_id uuid, _updates jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  update_item jsonb;
BEGIN
  IF NOT (is_workspace_member(_user_id, _workspace_id) OR is_app_admin(_user_id)) THEN
    RETURN json_build_object('error', 'Access denied');
  END IF;

  FOR update_item IN SELECT * FROM jsonb_array_elements(_updates)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM boards 
      WHERE id = (update_item->>'id')::uuid 
        AND workspace_id = _workspace_id
    ) THEN
      CONTINUE;
    END IF;

    IF NOT (can_edit_board(_user_id, (update_item->>'id')::uuid) OR is_app_admin(_user_id)) THEN
      CONTINUE;
    END IF;

    UPDATE boards
    SET position = (update_item->>'position')::integer
    WHERE id = (update_item->>'id')::uuid;
  END LOOP;

  RETURN json_build_object('success', true, 'updated', jsonb_array_length(_updates));
END;
$$;

-- Move board to workspace
CREATE OR REPLACE FUNCTION public.move_board_to_workspace(_user_id uuid, _board_id uuid, _new_workspace_id uuid, _new_position integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_workspace_id uuid;
  board_record record;
BEGIN
  IF NOT (can_edit_board(_user_id, _board_id) OR is_app_admin(_user_id)) THEN
    RETURN json_build_object('error', 'Access denied: you must be a board admin to move this board');
  END IF;

  SELECT * INTO board_record FROM boards WHERE id = _board_id;
  IF board_record IS NULL THEN
    RETURN json_build_object('error', 'Board not found');
  END IF;
  
  old_workspace_id := board_record.workspace_id;

  IF NOT (is_workspace_member(_user_id, _new_workspace_id) OR is_app_admin(_user_id)) THEN
    RETURN json_build_object('error', 'Access denied: you must have access to the target workspace');
  END IF;

  IF old_workspace_id = _new_workspace_id THEN
    UPDATE boards
    SET position = position + 1
    WHERE workspace_id = _new_workspace_id
      AND position >= _new_position
      AND id != _board_id;

    UPDATE boards
    SET position = _new_position, updated_at = now()
    WHERE id = _board_id;
  ELSE
    UPDATE boards
    SET position = position - 1
    WHERE workspace_id = old_workspace_id
      AND position > board_record.position;

    UPDATE boards
    SET position = position + 1
    WHERE workspace_id = _new_workspace_id
      AND position >= _new_position;

    UPDATE boards
    SET workspace_id = _new_workspace_id,
        position = _new_position,
        updated_at = now()
    WHERE id = _board_id;
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- Update card
CREATE OR REPLACE FUNCTION public.update_card(_user_id uuid, _card_id uuid, _title text DEFAULT NULL, _description text DEFAULT NULL, _due_date timestamp with time zone DEFAULT NULL, _clear_due_date boolean DEFAULT false)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  board_id_check uuid;
  updated_card record;
BEGIN
  SELECT c.board_id INTO board_id_check
  FROM cards ca
  JOIN columns c ON ca.column_id = c.id
  WHERE ca.id = _card_id;

  IF board_id_check IS NULL THEN
    RETURN json_build_object('error', 'Card not found');
  END IF;

  IF NOT (can_edit_board(_user_id, board_id_check) OR is_app_admin(_user_id)) THEN
    RETURN json_build_object('error', 'Access denied');
  END IF;

  UPDATE cards
  SET 
    title = COALESCE(_title, title),
    description = COALESCE(_description, description),
    due_date = CASE 
      WHEN _clear_due_date THEN NULL
      WHEN _due_date IS NOT NULL THEN _due_date
      ELSE due_date
    END,
    updated_at = now()
  WHERE id = _card_id
  RETURNING * INTO updated_card;

  RETURN json_build_object(
    'success', true,
    'card', json_build_object(
      'id', updated_card.id,
      'column_id', updated_card.column_id,
      'title', updated_card.title,
      'description', updated_card.description,
      'position', updated_card.position,
      'due_date', updated_card.due_date,
      'created_by', updated_card.created_by,
      'updated_at', updated_card.updated_at
    )
  );
END;
$$;

-- =====================================================
-- INVITE TOKEN FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION public.validate_and_redeem_invite_token(_token text, _user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token_record RECORD;
  existing_member RECORD;
  board_exists BOOLEAN;
BEGIN
  SELECT * INTO token_record
  FROM board_invite_tokens
  WHERE token = _token;

  IF token_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'invalid_token', 'message', 'This invite link is invalid.');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM boards WHERE id = token_record.board_id
  ) INTO board_exists;
  
  IF NOT board_exists THEN
    DELETE FROM board_invite_tokens WHERE id = token_record.id;
    RETURN json_build_object('success', false, 'error', 'deleted', 'message', 'This board no longer exists.');
  END IF;

  IF token_record.link_type = 'one_time' AND token_record.used_at IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'already_used', 'message', 'This invite link has already been used.');
  END IF;

  IF token_record.expires_at IS NOT NULL AND token_record.expires_at < now() THEN
    RETURN json_build_object('success', false, 'error', 'expired', 'message', 'This invite link has expired.');
  END IF;

  SELECT * INTO existing_member
  FROM board_members
  WHERE board_id = token_record.board_id AND user_id = _user_id;

  IF existing_member IS NOT NULL THEN
    IF token_record.link_type = 'one_time' THEN
      UPDATE board_invite_tokens
      SET used_at = now(), used_by = _user_id
      WHERE id = token_record.id;
    END IF;
    
    RETURN json_build_object(
      'success', true, 
      'already_member', true, 
      'board_id', token_record.board_id,
      'message', 'You are already a member of this board.'
    );
  END IF;

  INSERT INTO board_members (board_id, user_id, role)
  VALUES (token_record.board_id, _user_id, 'viewer');

  IF token_record.link_type = 'one_time' THEN
    UPDATE board_invite_tokens
    SET used_at = now(), used_by = _user_id
    WHERE id = token_record.id;
  END IF;

  INSERT INTO board_member_audit_log (board_id, action, target_user_id, actor_user_id, new_role)
  VALUES (token_record.board_id, 'added_via_invite', _user_id, token_record.created_by, 'viewer');

  RETURN json_build_object(
    'success', true, 
    'board_id', token_record.board_id,
    'message', 'You have been added to the board.'
  );
END;
$$;

-- =====================================================
-- UTILITY FUNCTIONS
-- =====================================================

-- Cleanup expired audit logs
CREATE OR REPLACE FUNCTION public.cleanup_expired_audit_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
  global_retention INTEGER;
BEGIN
  SELECT audit_log_retention_days INTO global_retention
  FROM app_settings
  WHERE id = 'default';

  IF global_retention IS NULL THEN
    RETURN 0;
  END IF;

  WITH deleted AS (
    DELETE FROM board_member_audit_log
    WHERE created_at < (now() - (global_retention || ' days')::interval)
    RETURNING *
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- Get board deletion counts
CREATE OR REPLACE FUNCTION public.get_board_deletion_counts(_board_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'columns', (SELECT COUNT(*) FROM columns WHERE board_id = _board_id),
    'cards', (SELECT COUNT(*) FROM cards WHERE column_id IN (SELECT id FROM columns WHERE board_id = _board_id)),
    'members', (SELECT COUNT(*) FROM board_members WHERE board_id = _board_id),
    'labels', (SELECT COUNT(*) FROM labels WHERE board_id = _board_id),
    'attachments', (SELECT COUNT(*) FROM card_attachments WHERE card_id IN (SELECT id FROM cards WHERE column_id IN (SELECT id FROM columns WHERE board_id = _board_id)))
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Get workspace deletion counts
CREATE OR REPLACE FUNCTION public.get_workspace_deletion_counts(_workspace_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  board_ids uuid[];
BEGIN
  SELECT ARRAY_AGG(id) INTO board_ids FROM boards WHERE workspace_id = _workspace_id;
  
  SELECT json_build_object(
    'boards', COALESCE(array_length(board_ids, 1), 0),
    'columns', (SELECT COUNT(*) FROM columns WHERE board_id = ANY(COALESCE(board_ids, ARRAY[]::uuid[]))),
    'cards', (SELECT COUNT(*) FROM cards WHERE column_id IN (SELECT id FROM columns WHERE board_id = ANY(COALESCE(board_ids, ARRAY[]::uuid[])))),
    'members', (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = _workspace_id)
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Update updated_at column trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =====================================================
-- AUTH TRIGGER FUNCTION
-- =====================================================

-- Handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count integer;
BEGIN
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

-- =====================================================
-- AUDIT LOG TRIGGER FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION public.log_board_member_added()
RETURNS trigger
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

CREATE OR REPLACE FUNCTION public.log_board_member_role_changed()
RETURNS trigger
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

CREATE OR REPLACE FUNCTION public.log_board_member_removed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.boards WHERE id = OLD.board_id) THEN
    INSERT INTO public.board_member_audit_log (board_id, action, target_user_id, actor_user_id, old_role)
    VALUES (OLD.board_id, 'removed', OLD.user_id, auth.uid(), OLD.role::text);
  END IF;
  RETURN OLD;
END;
$$;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auth trigger for new users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Board member audit triggers
CREATE TRIGGER log_board_member_added_trigger
  AFTER INSERT ON public.board_members
  FOR EACH ROW EXECUTE FUNCTION public.log_board_member_added();

CREATE TRIGGER log_board_member_role_changed_trigger
  AFTER UPDATE ON public.board_members
  FOR EACH ROW EXECUTE FUNCTION public.log_board_member_role_changed();

CREATE TRIGGER log_board_member_removed_trigger
  BEFORE DELETE ON public.board_members
  FOR EACH ROW EXECUTE FUNCTION public.log_board_member_removed();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_fonts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_member_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_invite_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_member_custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_pending_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_pending_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mysql_config ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES: profiles
-- =====================================================

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "App admins can view all profiles" ON public.profiles
  FOR SELECT USING (is_app_admin(auth.uid()));

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- =====================================================
-- RLS POLICIES: app_settings
-- =====================================================

CREATE POLICY "App settings are publicly readable" ON public.app_settings
  FOR SELECT USING (true);

CREATE POLICY "Only app admins can insert app settings" ON public.app_settings
  FOR INSERT WITH CHECK (is_app_admin(auth.uid()));

CREATE POLICY "App admins can update app settings" ON public.app_settings
  FOR UPDATE USING (is_app_admin(auth.uid()));

-- =====================================================
-- RLS POLICIES: custom_fonts
-- =====================================================

CREATE POLICY "Anyone can view custom fonts" ON public.custom_fonts
  FOR SELECT USING (true);

CREATE POLICY "Admins can insert fonts" ON public.custom_fonts
  FOR INSERT WITH CHECK (is_app_admin(auth.uid()));

CREATE POLICY "Admins can delete fonts" ON public.custom_fonts
  FOR DELETE USING (is_app_admin(auth.uid()));

-- =====================================================
-- RLS POLICIES: board_themes
-- =====================================================

CREATE POLICY "Authenticated users can view themes" ON public.board_themes
  FOR SELECT USING (true);

CREATE POLICY "App admins can create themes" ON public.board_themes
  FOR INSERT WITH CHECK (is_app_admin(auth.uid()));

CREATE POLICY "App admins can update themes" ON public.board_themes
  FOR UPDATE USING (is_app_admin(auth.uid()));

CREATE POLICY "App admins can delete themes" ON public.board_themes
  FOR DELETE USING (is_app_admin(auth.uid()) AND is_default = false);

-- =====================================================
-- RLS POLICIES: workspaces
-- =====================================================

CREATE POLICY "Workspace or board members can view workspaces" ON public.workspaces
  FOR SELECT USING (is_workspace_member(auth.uid(), id) OR is_board_member_in_workspace(auth.uid(), id) OR is_app_admin(auth.uid()));

CREATE POLICY "Only app admins can create workspaces" ON public.workspaces
  FOR INSERT WITH CHECK ((auth.uid() = owner_id) AND is_app_admin(auth.uid()));

CREATE POLICY "Owners or admins can update workspaces" ON public.workspaces
  FOR UPDATE USING ((auth.uid() = owner_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Owners or admins can delete workspaces" ON public.workspaces
  FOR DELETE USING ((auth.uid() = owner_id) OR is_app_admin(auth.uid()));

-- =====================================================
-- RLS POLICIES: workspace_members
-- =====================================================

CREATE POLICY "Members or app admins can view workspace members" ON public.workspace_members
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Owners or app admins can manage workspace members" ON public.workspace_members
  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_members.workspace_id AND workspaces.owner_id = auth.uid())) OR is_app_admin(auth.uid()));

CREATE POLICY "Owners or app admins can remove workspace members" ON public.workspace_members
  FOR DELETE USING ((EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_members.workspace_id AND workspaces.owner_id = auth.uid())) OR is_app_admin(auth.uid()));

-- =====================================================
-- RLS POLICIES: boards
-- =====================================================

CREATE POLICY "Board members or admins can view boards" ON public.boards
  FOR SELECT USING (is_board_member(auth.uid(), id) OR is_app_admin(auth.uid()));

CREATE POLICY "Only app admins can create boards" ON public.boards
  FOR INSERT WITH CHECK (is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can update boards" ON public.boards
  FOR UPDATE USING (can_edit_board(auth.uid(), id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can delete boards" ON public.boards
  FOR DELETE USING (can_edit_board(auth.uid(), id) OR is_app_admin(auth.uid()));

-- =====================================================
-- RLS POLICIES: board_members
-- =====================================================

CREATE POLICY "Board members or app admins can view board members" ON public.board_members
  FOR SELECT USING (is_board_member(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Users can view their own board memberships" ON public.board_members
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Board managers or app admins can add board members" ON public.board_members
  FOR INSERT WITH CHECK (can_manage_members(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can update board member roles" ON public.board_members
  FOR UPDATE USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board managers or app admins can remove board members" ON public.board_members
  FOR DELETE USING (can_manage_members(auth.uid(), board_id) OR is_app_admin(auth.uid()));

-- =====================================================
-- RLS POLICIES: board_member_audit_log
-- =====================================================

CREATE POLICY "Board admins or app admins can view audit logs" ON public.board_member_audit_log
  FOR SELECT USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "System can insert audit logs" ON public.board_member_audit_log
  FOR INSERT WITH CHECK (true);

-- =====================================================
-- RLS POLICIES: board_invite_tokens
-- =====================================================

CREATE POLICY "Board admins can view invite tokens" ON public.board_invite_tokens
  FOR SELECT USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins can create invite tokens" ON public.board_invite_tokens
  FOR INSERT WITH CHECK (can_edit_board(auth.uid(), board_id) AND auth.uid() = created_by);

CREATE POLICY "Board admins can update invite tokens" ON public.board_invite_tokens
  FOR UPDATE USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins can delete invite tokens" ON public.board_invite_tokens
  FOR DELETE USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

-- =====================================================
-- RLS POLICIES: custom_roles
-- =====================================================

CREATE POLICY "Authenticated users can view custom roles" ON public.custom_roles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "App admins can create custom roles" ON public.custom_roles
  FOR INSERT WITH CHECK (is_app_admin(auth.uid()) AND is_system = false);

CREATE POLICY "App admins can update custom roles" ON public.custom_roles
  FOR UPDATE USING (is_app_admin(auth.uid()) AND is_system = false);

CREATE POLICY "App admins can delete custom roles" ON public.custom_roles
  FOR DELETE USING (is_app_admin(auth.uid()) AND is_system = false);

-- =====================================================
-- RLS POLICIES: role_permissions
-- =====================================================

CREATE POLICY "Authenticated users can view role permissions" ON public.role_permissions
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "App admins can manage role permissions" ON public.role_permissions
  FOR INSERT WITH CHECK (is_app_admin(auth.uid()));

CREATE POLICY "App admins can update role permissions" ON public.role_permissions
  FOR UPDATE USING (is_app_admin(auth.uid()));

CREATE POLICY "App admins can delete role permissions" ON public.role_permissions
  FOR DELETE USING (is_app_admin(auth.uid()));

-- =====================================================
-- RLS POLICIES: board_member_custom_roles
-- =====================================================

CREATE POLICY "Board members can view custom role assignments" ON public.board_member_custom_roles
  FOR SELECT USING (is_board_member(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins can assign custom roles" ON public.board_member_custom_roles
  FOR INSERT WITH CHECK (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins can update custom role assignments" ON public.board_member_custom_roles
  FOR UPDATE USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins can remove custom role assignments" ON public.board_member_custom_roles
  FOR DELETE USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

-- =====================================================
-- RLS POLICIES: columns
-- =====================================================

CREATE POLICY "Board members or app admins can view columns" ON public.columns
  FOR SELECT USING (is_board_member(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can create columns" ON public.columns
  FOR INSERT WITH CHECK (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can update columns" ON public.columns
  FOR UPDATE USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can delete columns" ON public.columns
  FOR DELETE USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

-- =====================================================
-- RLS POLICIES: cards
-- =====================================================

CREATE POLICY "Board members or app admins can view cards" ON public.cards
  FOR SELECT USING ((EXISTS (SELECT 1 FROM columns c WHERE c.id = cards.column_id AND is_board_member(auth.uid(), c.board_id))) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can create cards" ON public.cards
  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM columns c WHERE c.id = cards.column_id AND can_edit_board(auth.uid(), c.board_id))) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can update cards" ON public.cards
  FOR UPDATE USING ((EXISTS (SELECT 1 FROM columns c WHERE c.id = cards.column_id AND can_edit_board(auth.uid(), c.board_id))) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can delete cards" ON public.cards
  FOR DELETE USING ((EXISTS (SELECT 1 FROM columns c WHERE c.id = cards.column_id AND can_edit_board(auth.uid(), c.board_id))) OR is_app_admin(auth.uid()));

-- =====================================================
-- RLS POLICIES: card_assignees
-- =====================================================

CREATE POLICY "Board members or app admins can view card assignees" ON public.card_assignees
  FOR SELECT USING ((EXISTS (SELECT 1 FROM cards ca JOIN columns co ON ca.column_id = co.id WHERE ca.id = card_assignees.card_id AND is_board_member(auth.uid(), co.board_id))) OR is_app_admin(auth.uid()));

CREATE POLICY "Board managers or app admins can add card assignees" ON public.card_assignees
  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM cards ca JOIN columns co ON ca.column_id = co.id WHERE ca.id = card_assignees.card_id AND can_manage_members(auth.uid(), co.board_id))) OR is_app_admin(auth.uid()));

CREATE POLICY "Board managers or app admins can remove card assignees" ON public.card_assignees
  FOR DELETE USING ((EXISTS (SELECT 1 FROM cards ca JOIN columns co ON ca.column_id = co.id WHERE ca.id = card_assignees.card_id AND can_manage_members(auth.uid(), co.board_id))) OR is_app_admin(auth.uid()));

-- =====================================================
-- RLS POLICIES: card_subtasks
-- =====================================================

CREATE POLICY "Board members or app admins can view card subtasks" ON public.card_subtasks
  FOR SELECT USING ((EXISTS (SELECT 1 FROM cards ca JOIN columns co ON ca.column_id = co.id WHERE ca.id = card_subtasks.card_id AND is_board_member(auth.uid(), co.board_id))) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can create card subtasks" ON public.card_subtasks
  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM cards ca JOIN columns co ON ca.column_id = co.id WHERE ca.id = card_subtasks.card_id AND can_edit_board(auth.uid(), co.board_id))) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can update card subtasks" ON public.card_subtasks
  FOR UPDATE USING ((EXISTS (SELECT 1 FROM cards ca JOIN columns co ON ca.column_id = co.id WHERE ca.id = card_subtasks.card_id AND can_edit_board(auth.uid(), co.board_id))) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can delete card subtasks" ON public.card_subtasks
  FOR DELETE USING ((EXISTS (SELECT 1 FROM cards ca JOIN columns co ON ca.column_id = co.id WHERE ca.id = card_subtasks.card_id AND can_edit_board(auth.uid(), co.board_id))) OR is_app_admin(auth.uid()));

-- =====================================================
-- RLS POLICIES: card_attachments
-- =====================================================

CREATE POLICY "Board members or app admins can view card attachments" ON public.card_attachments
  FOR SELECT USING ((EXISTS (SELECT 1 FROM cards ca JOIN columns co ON ca.column_id = co.id WHERE ca.id = card_attachments.card_id AND is_board_member(auth.uid(), co.board_id))) OR is_app_admin(auth.uid()));

CREATE POLICY "Only board admins or app admins can add card attachments" ON public.card_attachments
  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM cards ca JOIN columns co ON ca.column_id = co.id WHERE ca.id = card_attachments.card_id AND can_edit_board(auth.uid(), co.board_id))) OR is_app_admin(auth.uid()));

CREATE POLICY "Only board admins or app admins can delete card attachments" ON public.card_attachments
  FOR DELETE USING ((EXISTS (SELECT 1 FROM cards ca JOIN columns co ON ca.column_id = co.id WHERE ca.id = card_attachments.card_id AND can_edit_board(auth.uid(), co.board_id))) OR is_app_admin(auth.uid()));

-- =====================================================
-- RLS POLICIES: labels
-- =====================================================

CREATE POLICY "Board members or app admins can view labels" ON public.labels
  FOR SELECT USING (is_board_member(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can create labels" ON public.labels
  FOR INSERT WITH CHECK (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can update labels" ON public.labels
  FOR UPDATE USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can delete labels" ON public.labels
  FOR DELETE USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

-- =====================================================
-- RLS POLICIES: card_labels
-- =====================================================

CREATE POLICY "Board members or app admins can view card labels" ON public.card_labels
  FOR SELECT USING ((EXISTS (SELECT 1 FROM cards ca JOIN columns co ON ca.column_id = co.id WHERE ca.id = card_labels.card_id AND is_board_member(auth.uid(), co.board_id))) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can manage card labels" ON public.card_labels
  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM cards ca JOIN columns co ON ca.column_id = co.id WHERE ca.id = card_labels.card_id AND can_edit_board(auth.uid(), co.board_id))) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can delete card labels" ON public.card_labels
  FOR DELETE USING ((EXISTS (SELECT 1 FROM cards ca JOIN columns co ON ca.column_id = co.id WHERE ca.id = card_labels.card_id AND can_edit_board(auth.uid(), co.board_id))) OR is_app_admin(auth.uid()));

-- =====================================================
-- RLS POLICIES: import_pending_assignees
-- =====================================================

CREATE POLICY "Board admins or app admins can view pending assignees" ON public.import_pending_assignees
  FOR SELECT USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can insert pending assignees" ON public.import_pending_assignees
  FOR INSERT WITH CHECK (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can update pending assignees" ON public.import_pending_assignees
  FOR UPDATE USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can delete pending assignees" ON public.import_pending_assignees
  FOR DELETE USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

-- =====================================================
-- RLS POLICIES: import_pending_attachments
-- =====================================================

CREATE POLICY "Board admins or app admins can view pending attachments" ON public.import_pending_attachments
  FOR SELECT USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can insert pending attachments" ON public.import_pending_attachments
  FOR INSERT WITH CHECK (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can update pending attachments" ON public.import_pending_attachments
  FOR UPDATE USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins or app admins can delete pending attachments" ON public.import_pending_attachments
  FOR DELETE USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

-- =====================================================
-- RLS POLICIES: mysql_config
-- =====================================================

CREATE POLICY "Admins can check config status" ON public.mysql_config
  FOR SELECT USING (is_app_admin(auth.uid()));
