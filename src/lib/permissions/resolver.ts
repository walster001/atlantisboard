/**
 * Permission Resolver
 * 
 * This is the core hasPermission function that all permission checks flow through.
 * It provides a unified interface for checking permissions across the application.
 * 
 * SECURITY NOTE: This client-side check is for UI convenience only.
 * All actions MUST be verified server-side via RLS policies.
 */

import { PermissionKey, PermissionContext, BoardRole, APP_PERMISSIONS } from './types';
import { DEFAULT_ROLE_PERMISSIONS, APP_ADMIN_PERMISSIONS } from './registry';

/**
 * Core permission resolver function.
 * 
 * @param context - The permission context containing user info and board role
 * @param permission - The permission key to check
 * @returns boolean indicating if the user has the permission
 * 
 * @example
 * // Check if user can create a card
 * const canCreate = hasPermission(context, 'card.create');
 * 
 * @example
 * // Check app-level permission (unified admin)
 * const canAccessAdmin = hasPermission({ userId: user.id, isAppAdmin: true, boardRole: 'admin' }, 'app.admin.access');
 */
export function hasPermission(
  context: PermissionContext,
  permission: PermissionKey
): boolean {
  // Validate context
  if (!context.userId) {
    return false;
  }

  // App admins have all permissions
  if (context.isAppAdmin) {
    return true;
  }

  // Unified Admin: Board admins with role 'admin' get ALL permissions (app + board level)
  // This matches the unified Admin role in the UI
  if (context.boardRole === 'admin') {
    return true;
  }

  // Check if this is an app-level permission (non-admins don't get these)
  const isAppPermission = (APP_PERMISSIONS as readonly string[]).includes(permission);
  if (isAppPermission) {
    return false;
  }

  // For board-level permissions, we need a board role
  if (!context.boardRole) {
    return false;
  }

  // Check if the role has this permission in the default set
  const rolePermissions = DEFAULT_ROLE_PERMISSIONS[context.boardRole];
  return rolePermissions?.has(permission) ?? false;
}

/**
 * Check multiple permissions at once.
 * Returns true if the user has ALL specified permissions.
 */
export function hasAllPermissions(
  context: PermissionContext,
  permissions: PermissionKey[]
): boolean {
  return permissions.every(permission => hasPermission(context, permission));
}

/**
 * Check multiple permissions at once.
 * Returns true if the user has ANY of the specified permissions.
 */
export function hasAnyPermission(
  context: PermissionContext,
  permissions: PermissionKey[]
): boolean {
  return permissions.some(permission => hasPermission(context, permission));
}

/**
 * Get all permissions a user has in a given context.
 * Useful for debugging and UI rendering.
 */
export function getAllPermissions(context: PermissionContext): Set<PermissionKey> {
  const permissions = new Set<PermissionKey>();

  // Unified Admin: Both app admins AND board admins get all permissions
  if (context.isAppAdmin || context.boardRole === 'admin') {
    // Add all app-level permissions
    for (const permission of APP_ADMIN_PERMISSIONS) {
      permissions.add(permission);
    }
    // Add all board-level permissions
    for (const permission of DEFAULT_ROLE_PERMISSIONS.admin) {
      permissions.add(permission);
    }
  } else if (context.boardRole) {
    // Add permissions from the user's board role (manager/viewer)
    const rolePermissions = DEFAULT_ROLE_PERMISSIONS[context.boardRole];
    for (const permission of rolePermissions) {
      permissions.add(permission);
    }
  }

  return permissions;
}

/**
 * Create a permission context from common props.
 * This is a helper to build context objects consistently.
 */
export function createPermissionContext(
  userId: string | undefined | null,
  isAppAdmin: boolean,
  boardId?: string,
  boardRole?: BoardRole | null
): PermissionContext {
  return {
    userId: userId || '',
    isAppAdmin,
    boardId,
    boardRole: boardRole ?? undefined,
  };
}

/**
 * Legacy compatibility helpers
 * These map old role-based checks to the new permission system
 */

/**
 * Replaces: userRole === 'admin' || isAppAdmin
 * Use for checks that previously required admin role
 */
export function canEdit(context: PermissionContext): boolean {
  return hasPermission(context, 'board.edit');
}

/**
 * Replaces: userRole === 'admin' || userRole === 'manager' || isAppAdmin
 * Use for checks that previously allowed admin or manager
 */
export function canManageMembers(context: PermissionContext): boolean {
  return hasPermission(context, 'board.members.add');
}

/**
 * Replaces: userRole === 'admin'
 * Use for checks that specifically require admin role
 */
export function canChangeRoles(context: PermissionContext): boolean {
  return hasPermission(context, 'board.members.role.change');
}
