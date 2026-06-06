/** MongoDB ObjectId as 24 hex chars (strict; rejects literal "undefined" / empty). */
export const MONGO_OBJECT_ID_HEX = /^[a-fA-F0-9]{24}$/;

export function assertMongoObjectId(
  id: string | undefined,
  name: 'label id' | 'card id' | 'board id',
): asserts id is string {
  const s = id == null ? '' : String(id).trim();
  if (s === '' || s === 'undefined' || s === 'null' || !MONGO_OBJECT_ID_HEX.test(s)) {
    throw new Error(`Invalid ${name}`);
  }
}
