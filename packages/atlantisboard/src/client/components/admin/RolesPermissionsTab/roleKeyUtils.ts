export function toCustomRoleSlug(displayName: string): string {
  const raw = displayName.trim().toLowerCase();
  const dashed = raw
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-/, '')
    .replace(/-$/, '');
  return dashed;
}

export function buildUniqueCustomRoleKey(
  displayName: string,
  existingRoleKeys: ReadonlySet<string>,
): string | null {
  const baseSlug = toCustomRoleSlug(displayName);
  if (baseSlug.length < 3) {
    return null;
  }

  const maxSlugLen = 50;
  const trimmedBase = baseSlug.length > maxSlugLen ? baseSlug.slice(0, maxSlugLen) : baseSlug;
  const candidate = `custom:${trimmedBase}`;
  if (!existingRoleKeys.has(candidate)) {
    return candidate;
  }

  for (let index = 2; index < 1000; index += 1) {
    const suffix = `-${index}`;
    const allowedBaseLen = maxSlugLen - suffix.length;
    if (allowedBaseLen < 3) {
      return null;
    }
    const withSuffix = `custom:${trimmedBase.slice(0, allowedBaseLen)}${suffix}`;
    if (!existingRoleKeys.has(withSuffix)) {
      return withSuffix;
    }
  }
  return null;
}
