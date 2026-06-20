import { RoleDefinition } from '../models/RoleDefinition.js';
import {
  BUILTIN_ROLE_HIERARCHY_LEVELS,
  BUILTIN_ROLE_SEEDS,
} from '../../shared/permissions/catalog.js';

export { BUILTIN_ROLE_SEEDS } from '../../shared/permissions/catalog.js';

/** Force built-in role rows to match `BUILTIN_ROLE_SEEDS` (catalog is canonical). */
export async function syncBuiltinRolePermissionsFromCatalog(): Promise<void> {
  const bulkOps = BUILTIN_ROLE_SEEDS.map((seed) => ({
    updateOne: {
      filter: { key: seed.key, isBuiltIn: true },
      update: {
        $set: {
          displayName: seed.displayName,
          permissions: [...seed.permissions],
          hierarchyLevel: seed.hierarchyLevel,
        },
      },
    },
  }));
  if (bulkOps.length > 0) {
    await RoleDefinition.bulkWrite(bulkOps, { ordered: false });
  }
}

/** Upsert built-in role definitions and remove legacy "member" role. */
export async function seedBuiltinRoleDefinitions(): Promise<void> {
  const bulkOps = BUILTIN_ROLE_SEEDS.map((seed) => ({
    updateOne: {
      filter: { key: seed.key },
      update: {
        $setOnInsert: {
          key: seed.key,
          displayName: seed.displayName,
          permissions: [...seed.permissions],
          hierarchyLevel: seed.hierarchyLevel,
          isBuiltIn: true,
        },
      },
      upsert: true,
    },
  }));
  if (bulkOps.length > 0) {
    await RoleDefinition.bulkWrite(bulkOps, { ordered: false });
  }

  await RoleDefinition.deleteOne({ key: 'member', isBuiltIn: true }).catch(() => undefined);

  await RoleDefinition.updateMany(
    { key: 'admin', isBuiltIn: true, hierarchyLevel: { $exists: false } },
    { $set: { hierarchyLevel: BUILTIN_ROLE_HIERARCHY_LEVELS.admin } },
  ).catch(() => undefined);
  await RoleDefinition.updateMany(
    { key: 'manager', isBuiltIn: true, hierarchyLevel: { $exists: false } },
    { $set: { hierarchyLevel: BUILTIN_ROLE_HIERARCHY_LEVELS.manager } },
  ).catch(() => undefined);
  await RoleDefinition.updateMany(
    { key: 'viewer', isBuiltIn: true, hierarchyLevel: { $exists: false } },
    { $set: { hierarchyLevel: BUILTIN_ROLE_HIERARCHY_LEVELS.viewer } },
  ).catch(() => undefined);
}
