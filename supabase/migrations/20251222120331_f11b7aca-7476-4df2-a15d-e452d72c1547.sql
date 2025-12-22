-- Update permission_key enum: replace board.settings.access with board.settings.button and board.settings.members

-- Step 1: Create new enum with updated values
CREATE TYPE permission_key_new AS ENUM (
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
);

-- Step 2: Update role_permissions table to use new enum
ALTER TABLE public.role_permissions 
    ALTER COLUMN permission_key TYPE permission_key_new 
    USING permission_key::text::permission_key_new;

-- Step 3: Drop old functions that depend on old enum
DROP FUNCTION IF EXISTS public.has_permission(uuid, permission_key, uuid);
DROP FUNCTION IF EXISTS public.check_permission(permission_key, uuid);
DROP FUNCTION IF EXISTS public.get_user_permissions(uuid, uuid);

-- Step 4: Drop old enum and rename new one
DROP TYPE permission_key;
ALTER TYPE permission_key_new RENAME TO permission_key;

-- Step 5: Recreate has_permission function with updated permissions
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
            -- Manager permissions (updated with new settings permissions)
            RETURN _permission IN (
                'board.view', 'board.settings.button', 'board.settings.members',
                'board.members.view', 'board.members.add', 'board.members.remove',
                'board.invite.create', 'board.invite.delete',
                'attachment.view', 'attachment.download',
                'subtask.view'
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

-- Step 6: Recreate check_permission function
CREATE OR REPLACE FUNCTION public.check_permission(
    _permission permission_key,
    _board_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT has_permission(auth.uid(), _permission, _board_id);
$$;

-- Step 7: Recreate get_user_permissions function with updated permissions list
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