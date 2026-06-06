import { RoleDefinition } from '../models/RoleDefinition.js';
import {
  BUILTIN_ROLE_HIERARCHY_LEVELS,
  type BoardMemberRoleUpdateModeKey,
  type BuiltInRoleKey,
} from '../../shared/permissions/catalog.js';

export function isBuiltInRoleKey(key: string): key is BuiltInRoleKey {
  return key === 'admin' || key === 'manager' || key === 'viewer';
}

export function isValidCustomRoleKey(key: string): key is `custom:${string}` {
  if (!key.startsWith('custom:')) {
    return false;
  }
  const slug = key.slice('custom:'.length);
  return /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug);
}

/** Workspace/board custom roles must not include app-admin or account capability keys. */
export function findForbiddenWorkspaceRolePermission(
  permissions: readonly string[],
): string | null {
  for (const permission of permissions) {
    if (permission.startsWith('app.') || permission.startsWith('users.')) {
      return permission;
    }
  }
  return null;
}

export async function getRoleHierarchyLevel(roleKey: string): Promise<number | null> {
  const trimmed = roleKey.trim();
  if (trimmed === '') {
    return null;
  }
  if (isBuiltInRoleKey(trimmed)) {
    return BUILTIN_ROLE_HIERARCHY_LEVELS[trimmed];
  }
  if (!isValidCustomRoleKey(trimmed)) {
    return null;
  }
  const role = await RoleDefinition.findOne({ key: trimmed })
    .select('hierarchyLevel')
    .lean()
    .catch(() => null);
  return typeof role?.hierarchyLevel === 'number' && Number.isFinite(role.hierarchyLevel)
    ? role.hierarchyLevel
    : null;
}

export function resolveBoardMemberRoleUpdateModeFromPermissions(
  permissions: readonly string[],
): BoardMemberRoleUpdateModeKey | null {
  const set = new Set(permissions);
  if (set.has('boards.members.role.update.any')) {
    return 'boards.members.role.update.any';
  }
  if (set.has('boards.members.role.update.samehigher')) {
    return 'boards.members.role.update.samehigher';
  }
  if (set.has('boards.members.role.update.samelower')) {
    return 'boards.members.role.update.samelower';
  }
  if (set.has('boards.members.role.update.higher')) {
    return 'boards.members.role.update.higher';
  }
  if (set.has('boards.members.role.update.lower')) {
    return 'boards.members.role.update.lower';
  }
  if (set.has('boards.members.role.update.same')) {
    return 'boards.members.role.update.same';
  }
  return null;
}

export function canAssignByBoardMemberRoleUpdateMode(args: {
  readonly mode: BoardMemberRoleUpdateModeKey;
  readonly actorLevel: number;
  readonly targetCurrentLevel: number;
  readonly targetNextLevel: number;
  readonly selfChange: boolean;
}): boolean {
  const { mode, actorLevel, targetCurrentLevel, targetNextLevel, selfChange } = args;
  if (!Number.isFinite(actorLevel) || !Number.isFinite(targetCurrentLevel) || !Number.isFinite(targetNextLevel)) {
    return false;
  }
  if (mode === 'boards.members.role.update.any') {
    return true;
  }
  if (selfChange) {
    return false;
  }
  const targetIsSame = targetCurrentLevel === actorLevel;
  const targetIsLower = targetCurrentLevel < actorLevel;
  const targetIsHigher = targetCurrentLevel > actorLevel;
  const nextIsSame = targetNextLevel === actorLevel;
  const nextIsLower = targetNextLevel < actorLevel;
  const nextIsHigher = targetNextLevel > actorLevel;
  switch (mode) {
    case 'boards.members.role.update.same':
      return targetIsSame && nextIsSame;
    case 'boards.members.role.update.lower':
      return targetIsLower && nextIsLower;
    case 'boards.members.role.update.higher':
      return targetIsHigher && nextIsHigher;
    case 'boards.members.role.update.samehigher':
      return (targetIsSame || targetIsHigher) && (nextIsSame || nextIsHigher);
    case 'boards.members.role.update.samelower':
      return (targetIsSame || targetIsLower) && (nextIsSame || nextIsLower);
    default:
      return false;
  }
}
