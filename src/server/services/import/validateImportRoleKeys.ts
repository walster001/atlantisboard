import type { ImportPreflightPayloadParsed } from '../../../shared/import/importPreflightSchema.js';
import { validateRoleKeyExists } from '../roleService.js';

export async function validateImportRoleKeys(roleKeys: Iterable<string>): Promise<void> {
  const unique = new Set<string>();
  for (const key of roleKeys) {
    const trimmed = key.trim();
    if (trimmed !== '') {
      unique.add(trimmed);
    }
  }
  await Promise.all([...unique].map((key) => validateRoleKeyExists(key)));
}

export async function validateImportPreflightRoleKeys(
  preflight: ImportPreflightPayloadParsed | undefined,
): Promise<void> {
  if (preflight?.sourceRoleMappings == null || preflight.sourceRoleMappings.length === 0) {
    return;
  }
  await validateImportRoleKeys(preflight.sourceRoleMappings.map((mapping) => mapping.targetRoleKey));
}
