import { migrateRoleDefinitionPermissions } from './rolePermissionMigrations/roleDefinitionMigrations.js';
import { migrateMembershipRoleKeys } from './rolePermissionMigrations/membershipMigrations.js';
import { migrateMissingRoleHierarchyLevels } from './rolePermissionMigrations/hierarchyMigration.js';

/** Idempotent permission and membership migrations for role definitions and related collections. */
export async function runRolePermissionMigrations(): Promise<void> {
  await migrateRoleDefinitionPermissions();
  await migrateMembershipRoleKeys();
  await migrateMissingRoleHierarchyLevels();
}
