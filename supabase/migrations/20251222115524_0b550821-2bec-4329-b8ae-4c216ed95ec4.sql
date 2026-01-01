-- Step 3: Permission Sets with Legacy Role Fallback

-- Create table for custom roles (baked-in roles are handled in code)
CREATE TABLE public.custom_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    description text,
    is_system boolean NOT NULL DEFAULT false,
    created_by uuid REFERENCES public.profiles(id),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create table for role permissions (stores which permissions each custom role has)
CREATE TABLE public.role_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id uuid REFERENCES public.custom_roles(id) ON DELETE CASCADE,
    permission_key permission_key NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (role_id, permission_key)
);

-- Create table for board-level custom role assignments (separate from board_members.role)
CREATE TABLE public.board_member_custom_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id uuid REFERENCES public.boards(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    custom_role_id uuid REFERENCES public.custom_roles(id) ON DELETE CASCADE NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (board_id, user_id, custom_role_id)
);

-- Enable RLS on all new tables
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_member_custom_roles ENABLE ROW LEVEL SECURITY;

-- RLS policies for custom_roles
CREATE POLICY "Authenticated users can view custom roles"
ON public.custom_roles FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "App admins can create custom roles"
ON public.custom_roles FOR INSERT
WITH CHECK (is_app_admin(auth.uid()) AND is_system = false);

CREATE POLICY "App admins can update custom roles"
ON public.custom_roles FOR UPDATE
USING (is_app_admin(auth.uid()) AND is_system = false);

CREATE POLICY "App admins can delete custom roles"
ON public.custom_roles FOR DELETE
USING (is_app_admin(auth.uid()) AND is_system = false);

-- RLS policies for role_permissions
CREATE POLICY "Authenticated users can view role permissions"
ON public.role_permissions FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "App admins can manage role permissions"
ON public.role_permissions FOR INSERT
WITH CHECK (is_app_admin(auth.uid()));

CREATE POLICY "App admins can update role permissions"
ON public.role_permissions FOR UPDATE
USING (is_app_admin(auth.uid()));

CREATE POLICY "App admins can delete role permissions"
ON public.role_permissions FOR DELETE
USING (is_app_admin(auth.uid()));

-- RLS policies for board_member_custom_roles
CREATE POLICY "Board members can view custom role assignments"
ON public.board_member_custom_roles FOR SELECT
USING (is_board_member(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins can assign custom roles"
ON public.board_member_custom_roles FOR INSERT
WITH CHECK (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins can update custom role assignments"
ON public.board_member_custom_roles FOR UPDATE
USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

CREATE POLICY "Board admins can remove custom role assignments"
ON public.board_member_custom_roles FOR DELETE
USING (can_edit_board(auth.uid(), board_id) OR is_app_admin(auth.uid()));

-- Update has_permission function to check custom roles first, then fall back to legacy role
CREATE OR REPLACE FUNCTION public.has_permission(
    _user_id uuid,
    _permission permission_key,
    _board_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _is_admin boolean;
    _board_role board_role;
    _has_custom_permission boolean;
BEGIN
    -- Check if user is app admin (has all permissions)
    SELECT is_app_admin(_user_id) INTO _is_admin;
    IF _is_admin THEN
        RETURN true;
    END IF;
    
    -- App-level permissions (app.*) only available to app admins
    IF _permission::text LIKE 'app.%' THEN
        RETURN false;
    END IF;
    
    -- Board-level permissions require board context
    IF _board_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Check for custom role permissions first (future custom roles)
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
    
    -- Fall back to legacy role-based permissions
    SELECT role INTO _board_role
    FROM board_members
    WHERE board_id = _board_id AND user_id = _user_id;
    
    IF _board_role IS NULL THEN
        RETURN false;
    END IF;
    
    -- Legacy role permission mapping (matches DEFAULT_ROLE_PERMISSIONS in TypeScript)
    CASE _board_role
        WHEN 'admin' THEN
            -- Admin has all board-level permissions
            RETURN true;
        WHEN 'manager' THEN
            -- Manager permissions
            RETURN _permission IN (
                'board.view', 'board.edit', 'board.settings.access', 'board.settings.theme',
                'board.settings.labels', 'board.settings.audit', 'board.background.edit',
                'board.theme.assign', 'board.members.view', 'board.members.add',
                'board.members.remove', 'board.invite.create', 'board.invite.delete',
                'column.create', 'column.edit', 'column.delete', 'column.reorder', 'column.color.edit',
                'card.create', 'card.edit', 'card.delete', 'card.move', 'card.color.edit', 'card.duedate.edit',
                'label.create', 'label.edit', 'label.delete', 'label.assign', 'label.unassign',
                'attachment.view', 'attachment.upload', 'attachment.download', 'attachment.delete',
                'subtask.view', 'subtask.create', 'subtask.toggle', 'subtask.delete'
            );
        WHEN 'viewer' THEN
            -- Viewer permissions (read-only)
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

-- Create a function to get all permissions for a user on a board
CREATE OR REPLACE FUNCTION public.get_user_permissions(
    _user_id uuid,
    _board_id uuid DEFAULT NULL
)
RETURNS permission_key[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _is_admin boolean;
    _board_role board_role;
    _permissions permission_key[] := '{}';
    _all_permissions permission_key[] := ARRAY[
        'app.admin.access', 'app.admin.branding.view', 'app.admin.branding.edit',
        'app.admin.fonts.view', 'app.admin.fonts.edit', 'app.admin.login.view', 'app.admin.login.edit',
        'app.themes.create', 'app.themes.edit', 'app.themes.delete',
        'app.workspace.create', 'app.workspace.edit', 'app.workspace.delete',
        'app.board.create', 'app.board.import',
        'board.view', 'board.edit', 'board.delete', 'board.move',
        'board.settings.access', 'board.settings.theme', 'board.settings.labels', 'board.settings.audit',
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
    -- Check if user is app admin
    SELECT is_app_admin(_user_id) INTO _is_admin;
    IF _is_admin THEN
        RETURN _all_permissions;
    END IF;
    
    -- Check each permission
    FOREACH _perm IN ARRAY _all_permissions LOOP
        IF has_permission(_user_id, _perm, _board_id) THEN
            _permissions := array_append(_permissions, _perm);
        END IF;
    END LOOP;
    
    RETURN _permissions;
END;
$$;