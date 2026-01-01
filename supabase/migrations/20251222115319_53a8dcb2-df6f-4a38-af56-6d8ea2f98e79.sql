-- Create permission key enum type
-- This matches the TypeScript PermissionKey type
CREATE TYPE public.permission_key AS ENUM (
  -- Application-level permissions
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
  
  -- Board-level permissions
  'board.view',
  'board.edit',
  'board.delete',
  'board.move',
  'board.settings.access',
  'board.settings.theme',
  'board.settings.labels',
  'board.settings.audit',
  'board.background.edit',
  'board.theme.assign',
  
  -- Member management permissions
  'board.members.view',
  'board.members.add',
  'board.members.remove',
  'board.members.role.change',
  'board.invite.create',
  'board.invite.delete',
  
  -- Column permissions
  'column.create',
  'column.edit',
  'column.delete',
  'column.reorder',
  'column.color.edit',
  
  -- Card permissions
  'card.create',
  'card.edit',
  'card.delete',
  'card.move',
  'card.color.edit',
  'card.duedate.edit',
  
  -- Label permissions
  'label.create',
  'label.edit',
  'label.delete',
  'label.assign',
  'label.unassign',
  
  -- Attachment permissions
  'attachment.view',
  'attachment.upload',
  'attachment.download',
  'attachment.delete',
  
  -- Subtask permissions
  'subtask.view',
  'subtask.create',
  'subtask.toggle',
  'subtask.delete'
);

-- Server-side permission check function
-- This is the AUTHORITATIVE permission check - all actions must pass through this
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
  _is_app_admin boolean;
  _board_role board_role;
  _is_app_permission boolean;
BEGIN
  -- Get app admin status
  SELECT COALESCE(is_admin, false) INTO _is_app_admin
  FROM profiles WHERE id = _user_id;

  -- Check if this is an app-level permission
  _is_app_permission := _permission::text LIKE 'app.%';

  -- App-level permissions require app admin
  IF _is_app_permission THEN
    RETURN _is_app_admin;
  END IF;

  -- Board-level permissions: app admins have all permissions
  IF _is_app_admin THEN
    RETURN true;
  END IF;

  -- For board permissions, we need a board_id
  IF _board_id IS NULL THEN
    RETURN false;
  END IF;

  -- Get user's role on this board
  SELECT role INTO _board_role
  FROM board_members
  WHERE board_id = _board_id AND user_id = _user_id;

  -- No membership = no permission
  IF _board_role IS NULL THEN
    RETURN false;
  END IF;

  -- Check permission based on role
  -- Admin permissions (full access)
  IF _board_role = 'admin' THEN
    RETURN true;
  END IF;

  -- Manager permissions
  IF _board_role = 'manager' THEN
    RETURN _permission IN (
      'board.view',
      'board.settings.access',
      'board.members.view',
      'board.members.add',
      'board.members.remove',
      'attachment.view',
      'attachment.download',
      'subtask.view'
    );
  END IF;

  -- Viewer permissions (read-only)
  IF _board_role = 'viewer' THEN
    RETURN _permission IN (
      'board.view',
      'board.members.view',
      'attachment.view',
      'attachment.download',
      'subtask.view'
    );
  END IF;

  RETURN false;
END;
$$;

-- Convenience function for checking permission with auth.uid()
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
  SELECT public.has_permission(auth.uid(), _permission, _board_id)
$$;

-- Add comments for documentation
COMMENT ON TYPE public.permission_key IS 'All valid permission keys in the application';
COMMENT ON FUNCTION public.has_permission IS 'Authoritative server-side permission check. Returns true if user has the specified permission.';
COMMENT ON FUNCTION public.check_permission IS 'Convenience wrapper for has_permission that uses auth.uid()';