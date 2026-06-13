export function resolveReportingPageLimit(
  limit: number | undefined,
  defaultSize: number,
  maxSize: number,
): number {
  const raw = limit ?? defaultSize;
  return Math.min(Math.max(raw, 1), maxSize);
}

export function buildCreatedAtCursorFilter(
  cursor: string | undefined,
): { $lt: Date } | undefined {
  if (cursor == null || cursor.trim() === '') {
    return undefined;
  }
  const cursorTs = Number.parseInt(cursor, 10);
  if (!Number.isFinite(cursorTs) || cursorTs <= 0) {
    return undefined;
  }
  return { $lt: new Date(cursorTs) };
}

export function computeNextCreatedAtCursor<T extends { readonly createdAt: Date }>(
  docs: readonly T[],
  limit: number,
): string | undefined {
  if (docs.length <= limit || limit <= 0) {
    return undefined;
  }
  const page = docs.slice(0, limit);
  const last = page[page.length - 1];
  if (last == null) {
    return undefined;
  }
  return String(last.createdAt.getTime());
}

export function normalizeBoardName(name: unknown): string {
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : 'Untitled board';
}

export function normalizeListName(name: unknown): string {
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : 'Untitled list';
}

export function optionalIsoDate(value: Date | undefined | null): string | undefined {
  return value instanceof Date ? value.toISOString() : undefined;
}
