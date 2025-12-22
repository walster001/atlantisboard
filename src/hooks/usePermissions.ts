/**
 * usePermissions Hook
 * 
 * React hook for permission checking in components.
 * Provides a convenient API for checking permissions with memoized context.
 * 
 * @example
 * ```tsx
 * function MyComponent({ boardId, userRole }) {
 *   const { can, canAll, canAny, permissions } = usePermissions(boardId, userRole);
 * 
 *   return (
 *     <div>
 *       {can('card.create') && <Button>Add Card</Button>}
 *       {can('board.settings.access') && <SettingsButton />}
 *     </div>
 *   );
 * }
 * ```
 */

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
  /**
   * Check if user has a specific permission
   */
  can: (permission: PermissionKey) => boolean;
  
  /**
   * Check if user has ALL specified permissions
   */
  canAll: (...permissions: PermissionKey[]) => boolean;
  
  /**
   * Check if user has ANY of the specified permissions
   */
  canAny: (...permissions: PermissionKey[]) => boolean;
  
  /**
   * The current permission context
   */
  context: PermissionContext;
  
  /**
   * Set of all permissions the user currently has
   */
  permissions: Set<PermissionKey>;
  
  /**
   * Whether the user is an app admin
   */
  isAppAdmin: boolean;
  
  /**
   * The user's role on the current board
   */
  boardRole: BoardRole | null;
  
  /**
   * Legacy helper: equivalent to can('board.edit')
   */
  canEdit: boolean;
  
  /**
   * Legacy helper: equivalent to can('board.members.add')
   */
  canManageMembers: boolean;
  
  /**
   * Legacy helper: equivalent to can('board.members.role.change')
   */
  canChangeRoles: boolean;
}

/**
 * Hook for checking permissions in React components.
 * 
 * @param boardId - Optional board ID for board-level permission context
 * @param boardRole - Optional board role (admin/manager/viewer)
 * @returns Permission checking utilities
 */
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

/**
 * Hook for app-level permission checking (no board context needed).
 * 
 * @example
 * ```tsx
 * function AdminButton() {
 *   const { can } = useAppPermissions();
 *   
 *   if (!can('app.admin.access')) return null;
 *   return <Button>Admin Panel</Button>;
 * }
 * ```
 */
export function useAppPermissions() {
  return usePermissions(null, null);
}
