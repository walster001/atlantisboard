/**
 * Shared permission types and normalization helpers used by workspace and board checks.
 */

import { extractMongoStringId } from '../../shared/mongoId.js';
import { BUILTIN_ROLE_SEEDS } from '../../shared/permissions/catalog.js';

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
export function normalizeWorkspaceUserRef(ref: unknown): string {
  return extractMongoStringId(ref);
}

/**
 * Fallback permission set for a built-in role when RoleDefinition records are unavailable (e.g. early boot).
 * Derived from `BUILTIN_ROLE_SEEDS` — single source of truth in roleService.
 */
export function getBuiltinRolePermissionFallback(role: UserRole): readonly string[] {
  const seed = BUILTIN_ROLE_SEEDS.find((entry) => entry.key === role);
  return seed?.permissions ?? [];
}

export function normalizeListPermissionKey(permissionKey: string): string {
  if (!permissionKey.endsWith('.list')) {
    return permissionKey;
  }
  return `${permissionKey.slice(0, -'.list'.length)}.view`;
}

/**
 * Resource `*.view` keys are baseline read affordances: any authenticated member of the
 * board/workspace may read; custom roles must not be able to strip them. `invites.view` stays
 * permission-gated for UI (invite list visibility). `app.*` / `users.*` are never auto-granted here.
 */
export function isImplicitlyGrantedResourceViewPermission(permissionKey: string): boolean {
  if (permissionKey === 'invites.view') {
    return false;
  }
  if (permissionKey.startsWith('app.') || permissionKey.startsWith('users.')) {
    return false;
  }
  return permissionKey.endsWith('.view');
}

export const APP_ADMIN_KEYS: readonly string[] = [
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
