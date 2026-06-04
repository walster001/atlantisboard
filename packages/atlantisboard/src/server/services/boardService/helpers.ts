import mongoose from 'mongoose';

/**
 * `getUserWorkspaces(..., { view: 'detail' })` mixes member workspaces (Mongoose `_id`) and
 * board-only rows (`WorkspaceSummaryDTO` with `id` only). Reorder scope must accept both.
 */
export function workspaceListEntryId(entry: unknown): string {
  if (entry == null || typeof entry !== 'object') {
    return '';
  }
  const e = entry as { id?: unknown; _id?: { toString(): string } };
  if (typeof e.id === 'string' && e.id.trim() !== '') {
    return e.id.trim();
  }
  if (e._id != null && typeof e._id.toString === 'function') {
    return e._id.toString();
  }
  return '';
}

export function decodeCursor(cursor: string | undefined): number {
  if (cursor === undefined || cursor === '') {
    return 0;
  }
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}

/** ObjectId string for queries; supports raw ObjectId or populated User subdocs (not `doc.toString()`). */
export function extractRefUserIdString(ref: unknown): string {
  if (ref == null) {
    return '';
  }
  if (typeof ref === 'string') {
    return ref;
  }
  if (ref instanceof mongoose.Types.ObjectId) {
    return ref.toHexString();
  }
  if (typeof ref === 'object' && ref !== null && '_id' in ref) {
    return extractRefUserIdString((ref as { _id: unknown })._id);
  }
  const asString = String(ref);
  if (/^[a-f0-9]{24}$/i.test(asString)) {
    return asString;
  }
  return '';
}
