/** Escape user input before use in MongoDB `$regex` queries (ReDoS mitigation). */
export function escapeRegexMetacharacters(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const MAX_ACTIVITY_SEARCH_LENGTH = 100;

export function sanitizeActivitySearchInput(raw: string | undefined): string | undefined {
  if (raw == null) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    return undefined;
  }
  const capped = trimmed.slice(0, MAX_ACTIVITY_SEARCH_LENGTH);
  return escapeRegexMetacharacters(capped);
}
