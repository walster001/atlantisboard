import { RoleDefinition } from '../../models/RoleDefinition.js';

/** Backfill missing hierarchyLevel on custom role definitions. */
export async function migrateMissingRoleHierarchyLevels(): Promise<void> {
  const missingHierarchy = await RoleDefinition.find({ hierarchyLevel: { $exists: false } })
    .select('_id')
    .sort({ createdAt: 1, _id: 1 })
    .lean()
    .catch(() => []);
  if (missingHierarchy.length > 0) {
    const allWithHierarchy = await RoleDefinition.find({ hierarchyLevel: { $exists: true } })
      .select('hierarchyLevel')
      .lean()
      .catch(() => []);
    const used = new Set<number>();
    for (const row of allWithHierarchy) {
      if (typeof row.hierarchyLevel === 'number' && Number.isFinite(row.hierarchyLevel)) {
        used.add(row.hierarchyLevel);
      }
    }
    let maxUsed = 1000;
    used.forEach((value) => {
      if (value > maxUsed) {
        maxUsed = value;
      }
    });
    let next = maxUsed + 1;
    for (const row of missingHierarchy) {
      while (used.has(next)) {
        next += 1;
      }
      await RoleDefinition.updateOne({ _id: row._id }, { $set: { hierarchyLevel: next } }).catch(() => undefined);
      used.add(next);
      next += 1;
    }
  }
}
