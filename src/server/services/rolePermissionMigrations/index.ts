import { migrateRoleDefinitionPermissions } from './roleDefinitionMigrations.js';
import { migrateMembershipRoleKeys } from './membershipMigrations.js';
import { migrateMissingRoleHierarchyLevels } from './hierarchyMigration.js';

/** Idempotent permission and membership migrations for role definitions and related collections. */
export async function runRolePermissionMigrations(): Promise<void> {
  await migrateRoleDefinitionPermissions();
  await migrateMembershipRoleKeys();
  await migrateMissingRoleHierarchyLevels();
}
