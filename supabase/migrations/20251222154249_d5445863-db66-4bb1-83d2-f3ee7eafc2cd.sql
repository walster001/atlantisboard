-- Update has_permission to separate App Admin from Board Admin
-- App Admins get ALL permissions, Board Admins only get board-level permissions

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission permission_key, _board_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Board admins do NOT get app-level permissions
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
    
    -- Board Admin: has all BOARD-LEVEL permissions (not app-level)
    -- Manager and Viewer: specific permission sets
    CASE _board_role
        WHEN 'admin' THEN
            -- Board Admin has all board-level permissions
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
$function$;

-- Update get_user_permissions to match the separated logic
CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id uuid, _board_id uuid DEFAULT NULL::uuid)
 RETURNS permission_key[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Check if user is App Admin - gets ALL permissions
    SELECT is_app_admin(_user_id) INTO _is_app_admin;
    IF _is_app_admin THEN
        RETURN _all_permissions;
    END IF;
    
    -- If board context provided, check board role
    IF _board_id IS NOT NULL THEN
        SELECT role INTO _board_role
        FROM board_members
        WHERE board_id = _board_id AND user_id = _user_id;
        
        -- Board Admin gets all BOARD-LEVEL permissions (not app-level)
        IF _board_role = 'admin' THEN
            RETURN _board_permissions;
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