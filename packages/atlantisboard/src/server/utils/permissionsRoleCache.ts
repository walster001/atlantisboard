/**
 * Built-in and custom role permission resolution with short-lived cache.
 */

import { RoleDefinition } from '../models/index.js';
import {
  getBuiltinRolePermissionFallback,
  type RoleKey,
  type UserRole,
} from './permissionsShared.js';

type BuiltInPermissionsCache = Readonly<{
  readonly loadedAtMs: number;
  readonly byRole: ReadonlyMap<UserRole, readonly string[]>;
}>;

let builtInPermissionsCache: BuiltInPermissionsCache | null = null;
const BUILTIN_PERMISSIONS_CACHE_TTL_MS = 60_000;

export async function getBuiltInPermissions(role: UserRole): Promise<readonly string[]> {
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
    const perms = Array.isArray(def?.permissions) ? def.permissions : getBuiltinRolePermissionFallback(r);
    // Backward-compat: rename old permission key → new key.
    const normalized = perms.map((p) => (p === 'ui.boards.settings.open' ? 'boards.settings.open' : p));
    byRole.set(r, normalized);
  }

  builtInPermissionsCache = { loadedAtMs: now, byRole };
  return byRole.get(role) ?? getBuiltinRolePermissionFallback(role);
}

export async function getPermissionsForRoleKey(roleKey: RoleKey): Promise<readonly string[]> {
  if (roleKey === 'admin' || roleKey === 'manager' || roleKey === 'viewer') {
    return getBuiltInPermissions(roleKey);
  }
  const def = await RoleDefinition.findOne({ key: roleKey }).select('permissions').lean();
  const perms = Array.isArray(def?.permissions) ? def.permissions : [];
  // Backward-compat: rename old permission key → new key.
  return perms.map((p) => (p === 'ui.boards.settings.open' ? 'boards.settings.open' : p));
}
