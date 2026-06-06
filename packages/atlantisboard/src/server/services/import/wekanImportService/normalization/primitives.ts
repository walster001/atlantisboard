export function readWekanId(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const oid = record.$oid;
    if (typeof oid === 'string' && oid.trim() !== '') {
      return oid.trim();
    }
    const id = record.id;
    if (typeof id === 'string' && id.trim() !== '') {
      return id.trim();
    }
  }
  return undefined;
}

export function normalizeSortValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
      ? Number(value)
      : 0;
}
