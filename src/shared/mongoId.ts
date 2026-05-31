/**
 * Coerce Mongo ObjectId, EJSON `{ $oid }`, populated refs, or string ids to a plain string.
 */
export function extractMongoStringId(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.$oid === 'string' && o.$oid.trim().length > 0) {
      return o.$oid.trim();
    }
    const fromNestedId = extractMongoStringId(o._id);
    if (fromNestedId !== '') {
      return fromNestedId;
    }
    if (typeof o.id === 'string' && o.id.trim() !== '') {
      return o.id.trim();
    }
    const toString = (value as { toString?: () => string }).toString;
    if (typeof toString === 'function') {
      const s = toString.call(value);
      if (typeof s === 'string' && s.length > 0 && s !== '[object Object]') {
        return s.trim();
      }
    }
  }
  return '';
}
