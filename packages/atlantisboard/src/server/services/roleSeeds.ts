import { RoleDefinition } from '../models/RoleDefinition.js';
import {
  BUILTIN_ROLE_HIERARCHY_LEVELS,
  BUILTIN_ROLE_SEEDS,
} from '../../shared/permissions/catalog.js';

export { BUILTIN_ROLE_SEEDS } from '../../shared/permissions/catalog.js';

/** Upsert built-in role definitions and remove legacy "member" role. */
export async function seedBuiltinRoleDefinitions(): Promise<void> {
  for (const seed of BUILTIN_ROLE_SEEDS) {
    await RoleDefinition.updateOne(
      { key: seed.key },
      {
        $setOnInsert: {
          key: seed.key,
          displayName: seed.displayName,
          permissions: [...seed.permissions],
          hierarchyLevel: seed.hierarchyLevel,
          isBuiltIn: true,
        },
      },
      { upsert: true },
    );
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
