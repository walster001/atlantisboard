/**
 * Board-scoped permission checks and canonical hasPermission overload.
 */

import { Workspace } from '../models/Workspace.js';
import { Board } from '../models/Board.js';
import { logger } from './logger.js';
import { getPermissionsForRoleKey } from './permissionsRoleCache.js';
import {
  APP_ADMIN_KEYS,
  isImplicitlyGrantedResourceViewPermission,
  normalizeListPermissionKey,
  normalizeWorkspaceUserRef,
  type AuthUser,
  type RoleKey,
  type UserRole,
} from './permissionsShared.js';
import { hasWorkspacePermission } from './permissionsWorkspace.js';

async function resolveBoardRoleKey(userId: string, boardId: string): Promise<RoleKey | null> {
  const board = await Board.findById(boardId).select('ownerId workspaceId members visibility').lean();
  if (!board) {
    return null;
  }
  if (normalizeWorkspaceUserRef(board.ownerId) === userId) {
    return 'admin';
  }

  // Explicit per-board membership wins over workspace default role for this board.
  const boardMember = (board.members as Array<{ userId: unknown; role?: unknown; roleKey?: unknown }>).find(
    (m) => normalizeWorkspaceUserRef(m.userId) === userId,
  );
  const boardRoleKeyRaw =
    typeof boardMember?.roleKey === 'string' && boardMember.roleKey.trim() !== ''
      ? boardMember.roleKey.trim()
      : undefined;
  const boardRoleKey =
    boardRoleKeyRaw === 'member'
      ? ('viewer' as RoleKey)
      : boardRoleKeyRaw !== undefined
        ? (boardRoleKeyRaw as RoleKey)
        : undefined;
  if (boardRoleKey) {
    return boardRoleKey;
  }

  if (board.workspaceId) {
    const workspace = await Workspace.findById(board.workspaceId).select('ownerId members').lean();
    if (workspace) {
      if (normalizeWorkspaceUserRef(workspace.ownerId) === userId) {
        return 'admin';
      }
      const wsMember = (workspace.members as Array<{ userId: unknown; roleKey?: unknown }>).find(
        (m) => normalizeWorkspaceUserRef(m.userId) === userId,
      );
      if (typeof wsMember?.roleKey === 'string' && wsMember.roleKey.trim() !== '') {
        const rk = wsMember.roleKey.trim();
        return (rk === 'member' ? 'viewer' : rk) as RoleKey;
      }
    }
  }

  // Public boards grant viewer-level permissions to authenticated users.
  if (board.visibility === 'public') {
    return 'viewer';
  }

  // Private/workspace boards: no membership → no permissions.
  return null;
}

function isOwnerOnlyPermissionKey(permissionKey: string): boolean {
  // Preserve current behavior for destructive governance actions.
  return permissionKey === 'boards.delete' || permissionKey === 'workspaces.delete';
}

async function enforceOwnerOnlyRule(
  userId: string,
  permissionKey: string,
  boardId: string
): Promise<boolean> {
  if (permissionKey === 'boards.delete') {
    const board = await Board.findById(boardId).select('ownerId').lean();
    return board?.ownerId?.toString() === userId;
  }
  if (permissionKey === 'workspaces.delete') {
    const board = await Board.findById(boardId).select('workspaceId').lean();
    if (board?.workspaceId == null) {
      return false;
    }
    const workspace = await Workspace.findById(board.workspaceId).select('ownerId').lean();
    return normalizeWorkspaceUserRef(workspace?.ownerId) === userId;
  }
  return false;
}

export async function hasPermission(
  user: AuthUser,
  boardId: string,
  permissionKey: string
): Promise<boolean>;
export async function hasPermission(
  userId: string,
  resourceId: string,
  permission: string,
  resourceType: 'workspace' | 'board'
): Promise<boolean>;
export async function hasPermission(
  a: AuthUser | string,
  b: string,
  c: string,
  d?: 'workspace' | 'board'
): Promise<boolean> {
  try {
    // Canonical overload: (user, boardId, permissionKey)
    if (typeof a === 'object' && a !== null && 'id' in a && d === undefined) {
      const user = a as AuthUser;
      const boardId = b;
      const permissionKey = c;
      const normalizedPermissionKey = normalizeListPermissionKey(permissionKey);

      if (user.isAppAdmin === true) {
        // App Admin can do app.* domain; for board/workspace scope, fall through to normal role checks.
        if (normalizedPermissionKey.startsWith('app.') || normalizedPermissionKey === 'ui.admin_settings.open') {
          return APP_ADMIN_KEYS.includes(normalizedPermissionKey);
        }
      }

      const roleKey = await resolveBoardRoleKey(user.id, boardId);
      if (!roleKey) {
        return false;
      }
      if (isOwnerOnlyPermissionKey(normalizedPermissionKey)) {
        return enforceOwnerOnlyRule(user.id, normalizedPermissionKey, boardId);
      }
      if (isImplicitlyGrantedResourceViewPermission(normalizedPermissionKey)) {
        return true;
      }
      const perms = await getPermissionsForRoleKey(roleKey);
      // Backward compat: allow legacy `<domain>.list` if stored in DB.
      return perms.includes(normalizedPermissionKey) || perms.includes(permissionKey);
    }

    // Legacy overload: (userId, resourceId, permission, resourceType)
    if (typeof a === 'string' && d) {
      const userId = a;
      const resourceId = b;
      const permission = c;
      const resourceType = d;

      if (resourceType === 'workspace') {
        return hasWorkspacePermission(userId, resourceId, permission);
      }
      if (resourceType === 'board') {
        // Map to canonical when possible: treat `permission` as permissionKey and `resourceId` as boardId.
        return hasPermission({ id: userId }, resourceId, permission);
      }
      return false;
    }

    return false;
  } catch (error) {
    logger.error({ err: error }, 'Error checking permission');
    return false;
  }
}

/**
 * Get user role in board
 */
export async function getUserBoardRole(
  userId: string,
  boardId: string
): Promise<UserRole | null> {
  try {
    const roleKey = await resolveBoardRoleKey(userId, boardId);
    if (!roleKey) {
      return null;
    }
    if (roleKey === 'admin' || roleKey === 'manager' || roleKey === 'viewer') {
      return roleKey;
    }
    return 'viewer';
  } catch (error) {
    logger.error({ err: error, userId, boardId }, 'Error getting user board role');
    return null;
  }
}

/**
 * Check if user is board member
 */
export async function isBoardMember(
  userId: string,
  boardId: string
): Promise<boolean> {
  try {
    const board = await Board.findById(boardId);
    if (!board) return false;

    const workspace = await Workspace.findById(board.workspaceId);
    if (!workspace) return false;

    // Check workspace membership
    if (normalizeWorkspaceUserRef(workspace.ownerId) === userId) {
      return true;
    }

    if (workspace.members.some((m) => normalizeWorkspaceUserRef(m.userId) === userId)) {
      return true;
    }

    // Check board-specific membership
    return board.members.some((m) => normalizeWorkspaceUserRef(m.userId) === userId);
  } catch (error) {
    logger.error({ err: error, userId, boardId }, 'Error checking board membership');
    return false;
  }
}
