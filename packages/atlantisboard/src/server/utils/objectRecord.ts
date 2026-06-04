/** Narrow a plain object or DTO to a string-keyed record at JSON/import boundaries. */
export function objectToRecord(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}
