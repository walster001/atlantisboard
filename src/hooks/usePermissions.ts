import { useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  PermissionKey,
  PermissionContext,
  BoardRole,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  getAllPermissions,
  createPermissionContext,
} from '@/lib/permissions';

export interface UsePermissionsReturn {
  can: (permission: PermissionKey) => boolean;
  canAll: (...permissions: PermissionKey[]) => boolean;
  canAny: (...permissions: PermissionKey[]) => boolean;
  context: PermissionContext;
  permissions: Set<PermissionKey>;
  isAppAdmin: boolean;
  boardRole: BoardRole | null;
  canEdit: boolean;
  canManageMembers: boolean;
  canChangeRoles: boolean;
}

export function usePermissions(
  boardId?: string | null,
  boardRole?: BoardRole | null
): UsePermissionsReturn {
  const { user, isAppAdmin } = useAuth();

  // Create memoized context
  const context = useMemo<PermissionContext>(() => 
    createPermissionContext(
      user?.id,
      isAppAdmin,
      boardId ?? undefined,
      boardRole
    ),
    [user?.id, isAppAdmin, boardId, boardRole]
  );

  // Memoized permission checker
  const can = useCallback(
    (permission: PermissionKey): boolean => hasPermission(context, permission),
    [context]
  );

  // Memoized multi-permission checkers
  const canAll = useCallback(
    (...permissions: PermissionKey[]): boolean => hasAllPermissions(context, permissions),
    [context]
  );

  const canAny = useCallback(
    (...permissions: PermissionKey[]): boolean => hasAnyPermission(context, permissions),
    [context]
  );

  // Get all permissions (memoized)
  const permissions = useMemo(
    () => getAllPermissions(context),
    [context]
  );

  // Legacy helpers (memoized)
  const canEdit = useMemo(
    () => hasPermission(context, 'board.edit'),
    [context]
  );

  const canManageMembers = useMemo(
    () => hasPermission(context, 'board.members.add'),
    [context]
  );

  const canChangeRoles = useMemo(
    () => hasPermission(context, 'board.members.role.change'),
    [context]
  );

  return {
    can,
    canAll,
    canAny,
    context,
    permissions,
    isAppAdmin,
    boardRole: boardRole ?? null,
    canEdit,
    canManageMembers,
    canChangeRoles,
  };
}

export function useAppPermissions() {
  return usePermissions(null, null);
}
