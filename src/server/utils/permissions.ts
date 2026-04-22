/**
 * Permission utility functions for role-based access control
 */

import { Workspace } from '../models/Workspace.js';
import { Board } from '../models/Board.js';
import { logger } from './logger.js';
import { RoleDefinition } from '../models/index.js';

export type UserRole = 'admin' | 'manager' | 'viewer';
export type RoleKey = UserRole | `custom:${string}`;

export interface AuthUser {
  readonly id: string;
  readonly isAppAdmin?: boolean;
}

export interface PermissionContext {
  userId: string;
  workspaceId?: string;
  boardId?: string;
  userRole?: UserRole;
}

/**
 * Resolves owner/member `userId` refs to a canonical id string (handles populated docs and
 * ObjectIds). Matches workspace HTTP access checks in `workspaceService`.
 */
function normalizeWorkspaceUserRef(ref: unknown): string {
  if (ref == null) {
    return '';
  }
  if (typeof ref === 'string') {
    return ref.trim();
  }
  if (typeof ref === 'number' && Number.isFinite(ref)) {
    return String(ref);
  }
  if (typeof ref === 'object' && ref !== null) {
    const o = ref as Record<string, unknown>;
    if (o._id != null) {
      return typeof o._id === 'string' ? o._id : String(o._id);
    }
    if (typeof o.id === 'string' && o.id.trim() !== '') {
      return o.id;
    }
  }
  if (typeof ref === 'object' && ref !== null && 'toString' in ref) {
    const s = (ref as { toString: () => string }).toString();
    if (typeof s === 'string' && s !== '' && s !== '[object Object]') {
      return s;
    }
  }
  return '';
}

/**
 * Built-in role permission sets.
 *
 * IMPORTANT: This should preserve *current behavior*, not desired future behavior.
 * For actions that are owner-only today (e.g. deleting boards), enforcement is handled
 * as a hard rule in hasPermission() even if a role includes the key.
 */
// Fallbacks used if RoleDefinition records are unavailable (e.g. early boot).
const BUILTIN_ROLE_PERMISSION_FALLBACKS: Readonly<Record<UserRole, readonly string[]>> = {
  viewer: [
    'workspaces.view',
    'boards.view',
    'lists.view',
    'cards.view',
    'export.board.json',
    'export.board.csv',
    'attachments.download_url.view',
    'attachments.file.stream',
    'invites.accept',
    'labels.view',
  ],
  manager: [
    'workspaces.view',
    'boards.view',
    'lists.view',
    'cards.view',
    'export.board.json',
    'export.board.csv',
    'attachments.download_url.view',
    'attachments.file.stream',
    'invites.accept',
    'labels.view',
    'boards.members.view',
    'boards.members.add',
    'boards.members.remove',
    'boards.members.role.update',
    'boards.members.role.update.samelower',
    'boards.settings.open',
    'lists.create',
    'lists.update',
    'lists.reorder',
    'boards.reorder_in_home',
    'cards.create',
    'cards.update',
    'cards.move',
    'cards.reorder',
    'attachments.upload',
    'attachments.delete',
    'checklists.create',
    'checklists.update',
    'checklists.delete',
    'checklists.items.create',
    'checklists.items.update',
    'checklists.items.delete',
    'comments.create',
    'comments.delete',
    'cards.duplicate',
  ],
  admin: [
    'workspaces.view',
    'workspaces.update',
    'workspaces.members.view',
    'workspaces.members.add',
    'workspaces.members.remove',
    'workspaces.members.role.update',
    'boards.view',
    'lists.view',
    'cards.view',
    'export.board.json',
    'export.board.csv',
    'attachments.download_url.view',
    'attachments.file.stream',
    'invites.accept',
    'labels.view',
    'boards.members.view',
    'boards.members.add',
    'boards.members.remove',
    'boards.members.role.update',
    'boards.members.role.update.any',
    'boards.settings.open',
    'labels.create',
    'labels.update',
    'labels.delete',
    'invites.create',
    'invites.view',
    'invites.delete',
    'boards.update',
    'boards.settings.update',
    'boards.reorder_in_home',
    'boards.create',
    'lists.create',
    'lists.update',
    'lists.reorder',
    'lists.delete',
    'cards.create',
    'cards.update',
    'cards.delete',
    'cards.move',
    'cards.reorder',
    'cards.duplicate',
    'attachments.upload',
    'attachments.delete',
    'checklists.create',
    'checklists.update',
    'checklists.delete',
    'checklists.items.create',
    'checklists.items.update',
    'checklists.items.delete',
    'comments.create',
    'comments.delete',
  ],
} as const;

function normalizeListPermissionKey(permissionKey: string): string {
  if (!permissionKey.endsWith('.list')) {
    return permissionKey;
  }
  return `${permissionKey.slice(0, -'.list'.length)}.view`;
}

type BuiltInPermissionsCache = Readonly<{
  readonly loadedAtMs: number;
  readonly byRole: ReadonlyMap<UserRole, readonly string[]>;
}>;

let builtInPermissionsCache: BuiltInPermissionsCache | null = null;
const BUILTIN_PERMISSIONS_CACHE_TTL_MS = 60_000;

async function getBuiltInPermissions(role: UserRole): Promise<readonly string[]> {
  const now = Date.now();
  if (builtInPermissionsCache && now - builtInPermissionsCache.loadedAtMs < BUILTIN_PERMISSIONS_CACHE_TTL_MS) {
    const cached = builtInPermissionsCache.byRole.get(role);
    if (cached) return cached;
  }

  const byRole = new Map<UserRole, readonly string[]>();
  const roles: readonly UserRole[] = ['admin', 'manager', 'viewer'];
  for (const r of roles) {
    const def = await RoleDefinition.findOne({ key: r, isBuiltIn: true })
      .select('permissions')
      .lean()
      .catch(() => null);
    const perms = Array.isArray(def?.permissions) ? def.permissions : BUILTIN_ROLE_PERMISSION_FALLBACKS[r];
    // Backward-compat: rename old permission key → new key.
    const normalized = perms.map((p) => (p === 'ui.boards.settings.open' ? 'boards.settings.open' : p));
    byRole.set(r, normalized);
  }

  builtInPermissionsCache = { loadedAtMs: now, byRole };
  return byRole.get(role) ?? BUILTIN_ROLE_PERMISSION_FALLBACKS[role];
}

const APP_ADMIN_KEYS: readonly string[] = [
  'app.admin_config.view',
  'app.admin_config.edit',
  'app.admin_config.external_mysql.test',
  'app.branding.assets.upload',
  'app.branding.assets.delete',
  'app.fonts.upload',
  'app.fonts.delete',
  'app.users.unlock',
  'app.users.placeholder.list',
  'app.users.placeholder.convert',
  'app.users.placeholder.merge',
  'app.roles.list',
  'app.roles.create',
  'app.roles.update',
  'app.roles.delete',
  'app.roles.assign_app_admin',
  'app.permission_sets.list',
  'app.permission_sets.create',
  'app.permission_sets.update',
  'app.permission_sets.delete',
  'ui.admin_settings.open',
];

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

async function getPermissionsForRoleKey(roleKey: RoleKey): Promise<readonly string[]> {
  if (roleKey === 'admin' || roleKey === 'manager' || roleKey === 'viewer') {
    return getBuiltInPermissions(roleKey);
  }
  const def = await RoleDefinition.findOne({ key: roleKey }).select('permissions').lean();
  const perms = Array.isArray(def?.permissions) ? def.permissions : [];
  // Backward-compat: rename old permission key → new key.
  return perms.map((p) => (p === 'ui.boards.settings.open' ? 'boards.settings.open' : p));
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
  return true;
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
        const workspace = await Workspace.findById(resourceId);
        if (!workspace) return false;
        if (normalizeWorkspaceUserRef(workspace.ownerId) === userId) {
          return true;
        }
        const member = workspace.members.find((m) => normalizeWorkspaceUserRef(m.userId) === userId);
        if (!member) return false;
        const rawKey =
          typeof member.roleKey === 'string' && member.roleKey.trim() !== ''
            ? member.roleKey.trim()
            : 'viewer';
        const roleKey = (rawKey === 'member' ? 'viewer' : rawKey) as RoleKey;
        const perms = await getPermissionsForRoleKey(roleKey);
        const normalizedPermission = normalizeListPermissionKey(permission);
        return perms.includes(normalizedPermission) || perms.includes(permission);
      }
      if (resourceType === 'board') {
        // Map to canonical when possible: treat `permission` as permissionKey and `resourceId` as boardId.
        return hasPermission({ id: userId }, resourceId, permission);
      }
      return false;
    }

    return false;
  } catch (error) {
    logger.error({ error }, 'Error checking permission');
    return false;
  }
}

/**
 * Whether the user may organize boards in a workspace's home row (reorder within the row or move boards
 * in/out). Aligns with {@link reorderBoardsInHomeScope}: `workspaces.update`, workspace ownership,
 * or a workspace role whose permission set includes `boards.reorder_in_home` (e.g. built-in manager).
 */
export async function userCanReorganizeWorkspaceHomeBoardBucket(
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  if (await hasPermission(userId, workspaceId, 'workspaces.update', 'workspace')) {
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
  const perms = await getPermissionsForRoleKey(roleKey);
  return perms.includes('boards.reorder_in_home');
}

/**
 * Get user role in workspace
 */
export async function getUserWorkspaceRole(
  userId: string,
  workspaceId: string
): Promise<UserRole | null> {
  try {
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) return null;

    if (normalizeWorkspaceUserRef(workspace.ownerId) === userId) {
      return 'admin';
    }

    const member = workspace.members.find((m) => normalizeWorkspaceUserRef(m.userId) === userId);
    if (!member) return null;
    const rk = member.roleKey;
    return (rk === 'member' ? 'viewer' : rk) as UserRole;
  } catch (error) {
    logger.error({ error, userId, workspaceId }, 'Error getting user workspace role');
    return null;
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
    logger.error({ error, userId, boardId }, 'Error getting user board role');
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
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) return false;

    if (normalizeWorkspaceUserRef(workspace.ownerId) === userId) {
      return true;
    }

    return workspace.members.some((m) => normalizeWorkspaceUserRef(m.userId) === userId);
  } catch (error) {
    logger.error({ error, userId, workspaceId }, 'Error checking workspace membership');
    return false;
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
    logger.error({ error, userId, boardId }, 'Error checking board membership');
    return false;
  }
}

