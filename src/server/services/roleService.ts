import { logger } from '../utils/logger.js';
import {
  BOARD_MEMBER_ROLE_UPDATE_MODE_KEYS,
  BUILTIN_ROLE_SEEDS,
  type BoardMemberRoleUpdateModeKey,
  type BuiltInRoleKey,
  type BuiltInRoleSeed,
  type RoleKey,
} from '../../shared/permissions/catalog.js';
import { seedBuiltinRoleDefinitions, syncBuiltinRolePermissionsFromCatalog } from './roleSeeds.js';
import { runRolePermissionMigrations } from './rolePermissionMigrations.js';

export type { BoardMemberRoleUpdateModeKey, BuiltInRoleKey, BuiltInRoleSeed, RoleKey };
export { BUILTIN_ROLE_SEEDS, BOARD_MEMBER_ROLE_UPDATE_MODE_KEYS };

export {
  canAssignByBoardMemberRoleUpdateMode,
  findForbiddenWorkspaceRolePermission,
  getRoleHierarchyLevel,
  isBuiltInRoleKey,
  isValidCustomRoleKey,
  resolveBoardMemberRoleUpdateModeFromPermissions,
} from './roleResolution.js';

let roleDefinitionsInitPromise: Promise<void> | null = null;

export async function initializeRoleDefinitions(): Promise<void> {
  if (roleDefinitionsInitPromise != null) {
    return roleDefinitionsInitPromise;
  }

  roleDefinitionsInitPromise = seedRoleDefinitions().catch((err) => {
    roleDefinitionsInitPromise = null;
    throw err;
  });

  return roleDefinitionsInitPromise;
}

async function seedRoleDefinitions(): Promise<void> {
  await seedBuiltinRoleDefinitions();
  await runRolePermissionMigrations();
  await syncBuiltinRolePermissionsFromCatalog();
  logger.info('Role definitions initialized');
}
