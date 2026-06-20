/**
 * Workspace-scoped permission checks.
 */

import { Workspace } from '../models/Workspace.js';
import { userHasAccountCapability } from '../services/accountCapabilitiesService.js';
import { logger } from './logger.js';
import { getPermissionsForRoleKey } from './permissionsRoleCache.js';
import {
  isImplicitlyGrantedResourceViewPermission,
  normalizeListPermissionKey,
  normalizeWorkspaceUserRef,
  type RoleKey,
  type UserRole,
} from './permissionsShared.js';

/**
 * True when the user's role in at least one workspace they belong to grants `permissionKey`
 * (workspace owners are treated as having all workspace-scoped keys via hasPermission).
 */
export async function userHasPermissionInAnyWorkspace(
  userId: string,
  permissionKey: string,
): Promise<boolean> {
  const workspaces = await Workspace.find({
    $or: [{ ownerId: userId }, { 'members.userId': userId }],
  })
    .select('_id')
    .lean();

  for (const workspace of workspaces) {
    const workspaceId = String(workspace._id);
    if (await hasWorkspacePermission(userId, workspaceId, permissionKey)) {
      return true;
    }
  }
  return false;
}

export async function userCanUseImportDisplay(
  userId: string,
  isAppAdmin?: boolean,
): Promise<boolean> {
  if (isAppAdmin === true) {
    return true;
  }
  return userHasAccountCapability(userId, 'import.display');
}

export async function userCanCreateWorkspace(
  userId: string,
  isAppAdmin?: boolean,
): Promise<boolean> {
  if (isAppAdmin === true) {
    return true;
  }
  return userHasAccountCapability(userId, 'workspaces.create');
}

export async function hasWorkspacePermission(
  userId: string,
  workspaceId: string,
  permissionKey: string,
): Promise<boolean> {
  try {
    const workspace = await Workspace.findById(workspaceId)
      .select('ownerId members.userId members.roleKey')
      .lean();
    if (!workspace) {
      return false;
    }

    const normalizedPermission = normalizeListPermissionKey(permissionKey);
    if (normalizedPermission === 'workspaces.delete' || permissionKey === 'workspaces.delete') {
      return normalizeWorkspaceUserRef(workspace.ownerId) === userId;
    }

    if (normalizeWorkspaceUserRef(workspace.ownerId) === userId) {
      return true;
    }
    const member = (workspace.members as Array<{ userId: unknown; roleKey?: unknown }>).find(
      (m) => normalizeWorkspaceUserRef(m.userId) === userId,
    );
    if (!member) {
      return false;
    }
    const rawKey =
      typeof member.roleKey === 'string' && member.roleKey.trim() !== ''
        ? member.roleKey.trim()
        : 'viewer';
    const roleKey = (rawKey === 'member' ? 'viewer' : rawKey) as RoleKey;
    const perms = await getPermissionsForRoleKey(roleKey);
    if (isImplicitlyGrantedResourceViewPermission(normalizedPermission)) {
      return true;
    }
    return perms.includes(normalizedPermission) || perms.includes(permissionKey);
  } catch (error) {
    logger.error({ err: error, userId, workspaceId, permissionKey }, 'Error checking workspace permission');
    return false;
  }
}

/**
 * Whether the user may move boards between workspace home rows (`Board.workspaceId` changes).
 * Per-user tile order within a row does not require this — any signed-in user with access may reorder locally.
 */
export async function userCanReorganizeWorkspaceHomeBoardBucket(
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  if (await hasWorkspacePermission(userId, workspaceId, 'workspaces.update')) {
    return true;
  }
  const workspace = await Workspace.findById(workspaceId).select('ownerId members').lean();
  if (!workspace) {
    return false;
  }
  if (normalizeWorkspaceUserRef(workspace.ownerId) === userId) {
    return true;
  }
  const member = (workspace.members as Array<{ userId?: unknown; roleKey?: unknown }>).find(
    (m) => normalizeWorkspaceUserRef(m.userId) === userId,
  );
  if (!member) {
    return false;
  }
  const rawKey =
    typeof member.roleKey === 'string' && member.roleKey.trim() !== ''
      ? member.roleKey.trim()
      : 'viewer';
  const roleKey = (rawKey === 'member' ? 'viewer' : rawKey) as RoleKey;
  return roleKey === 'admin' || roleKey === 'manager';
}

/**
 * Get user role in workspace
 */
export async function getUserWorkspaceRole(
  userId: string,
  workspaceId: string
): Promise<UserRole | null> {
  try {
    const workspace = await Workspace.findById(workspaceId)
      .select('ownerId members.userId members.roleKey')
      .lean();
    if (!workspace) return null;

    if (normalizeWorkspaceUserRef(workspace.ownerId) === userId) {
      return 'admin';
    }

    const member = (workspace.members as Array<{ userId: unknown; roleKey?: unknown }>).find(
      (m) => normalizeWorkspaceUserRef(m.userId) === userId,
    );
    if (!member) return null;
    const rk = member.roleKey;
    return (rk === 'member' ? 'viewer' : rk) as UserRole;
  } catch (error) {
    logger.error({ err: error, userId, workspaceId }, 'Error getting user workspace role');
    return null;
  }
}

/**
 * Check if user is workspace member
 */
export async function isWorkspaceMember(
  userId: string,
  workspaceId: string
): Promise<boolean> {
  try {
    const workspace = await Workspace.findById(workspaceId)
      .select('ownerId members.userId')
      .lean();
    if (!workspace) return false;

    if (normalizeWorkspaceUserRef(workspace.ownerId) === userId) {
      return true;
    }

    return (workspace.members as Array<{ userId: unknown }>).some(
      (m) => normalizeWorkspaceUserRef(m.userId) === userId,
    );
  } catch (error) {
    logger.error({ err: error, userId, workspaceId }, 'Error checking workspace membership');
    return false;
  }
}
