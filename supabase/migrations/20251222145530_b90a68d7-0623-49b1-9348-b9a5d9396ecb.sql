-- Update has_permission function to grant ALL permissions to board admins
-- This unifies App Admin and Board Admin into a single Admin role with full access

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission permission_key, _board_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    
    -- Get user's board role
    SELECT role INTO _board_role
    FROM board_members
    WHERE board_id = _board_id AND user_id = _user_id;
    
    IF _board_role IS NULL THEN
        RETURN false;
    END IF;
    
    -- Unified Admin role: Board admins get ALL permissions (app + board level)
    -- This matches the UI where Admin role shows full access
    CASE _board_role
        WHEN 'admin' THEN
            -- Admin has ALL permissions including app-level
            RETURN true;
        WHEN 'manager' THEN
            -- Manager permissions
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
$function$;

-- Update get_user_permissions to reflect unified admin
CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id uuid, _board_id uuid DEFAULT NULL::uuid)
 RETURNS permission_key[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    
    -- If board context provided, check if user is board admin (unified admin)
    IF _board_id IS NOT NULL THEN
        SELECT role INTO _board_role
        FROM board_members
        WHERE board_id = _board_id AND user_id = _user_id;
        
        -- Board admins get all permissions (unified admin role)
        IF _board_role = 'admin' THEN
            RETURN _all_permissions;
        END IF;
    END IF;
    
    -- Check each permission for non-admin roles
    FOREACH _perm IN ARRAY _all_permissions LOOP
        IF has_permission(_user_id, _perm, _board_id) THEN
            _permissions := array_append(_permissions, _perm);
        END IF;
    END LOOP;
    
    RETURN _permissions;
END;
$function$;