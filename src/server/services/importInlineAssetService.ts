import crypto from 'crypto';
import type { Types } from 'mongoose';
import { getMinIOClient } from '../config/minio.js';
import { Card } from '../models/Card.js';
import { logger } from '../utils/logger.js';

const BUCKET = 'import-inline';
const MAX_BYTES = 5 * 1024 * 1024;

const IMPORT_INLINE_OBJECT_STEM_RE =
  /\/api\/v1\/import-inline\/([a-f0-9-]{36}\.(?:png|jpg|jpeg|webp|svg|ico))\b/gi;

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico']);

const IMAGE_MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'image/ico': '.ico',
};

function guessContentTypeFromName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
  };
  return ext && map[ext] ? map[ext] : 'application/octet-stream';
}

function extFromOriginalName(originalName: string | undefined): string | null {
  if (!originalName || typeof originalName !== 'string') {
    return null;
  }
  const base = originalName.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot < 0) {
    return null;
  }
  const extWithDot = base.slice(dot);
  return ALLOWED_EXT.has(extWithDot) ? extWithDot : null;
}

function resolveExtension(mimeType: string, originalName: string | undefined): string | null {
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const fromMime = IMAGE_MIME_TO_EXT[normalized];
  if (fromMime && ALLOWED_EXT.has(fromMime)) {
    return fromMime;
  }
  return extFromOriginalName(originalName);
}

function isMinioNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const code = (err as { code?: string }).code;
  return code === 'NotFound' || code === 'NoSuchKey';
}

export function collectImportInlineObjectNamesFromText(
  text: string | undefined | null,
  into: Set<string>
): void {
  if (typeof text !== 'string' || text.length === 0) {
    return;
  }
  for (const match of text.matchAll(IMPORT_INLINE_OBJECT_STEM_RE)) {
    const stem = match[1];
    if (stem != null && stem !== '') {
      into.add(stem);
    }
  }
}

function collectImportInlineObjectNamesFromCardLean(
  c: { description?: unknown; descriptionHtml?: unknown },
  into: Set<string>
): void {
  collectImportInlineObjectNamesFromText(
    typeof c.description === 'string' ? c.description : undefined,
    into
  );
  collectImportInlineObjectNamesFromText(
    typeof c.descriptionHtml === 'string' ? c.descriptionHtml : undefined,
    into
  );
}

type CardImportInlineCleanupFilter =
  | { readonly boardId: { readonly $in: readonly Types.ObjectId[] } }
  | { readonly listId: { readonly $in: readonly Types.ObjectId[] } };

async function removeImportInlineObjectsForCardsMatching(
  filter: CardImportInlineCleanupFilter
): Promise<void> {
  const cards = await Card.find(filter).select('description descriptionHtml').lean();
  const names = new Set<string>();
  for (const c of cards) {
    collectImportInlineObjectNamesFromCardLean(c, names);
  }
  await removeImportInlineObjectsByNames(names);
}

async function removeImportInlineObjectsByNames(names: ReadonlySet<string>): Promise<void> {
  if (names.size === 0) {
    return;
  }
  const client = getMinIOClient();
  for (const objectName of names) {
    try {
      await client.removeObject(BUCKET, objectName);
    } catch (error: unknown) {
      if (isMinioNotFound(error)) {
        continue;
      }
      logger.warn({ error, objectName, bucket: BUCKET }, 'Failed to remove import-inline object');
    }
  }
}

/**
 * Removes Wekan-import inline-button icon objects referenced on cards in the given boards
 * (MinIO `import-inline` bucket). Must run before `Card.deleteMany` for those boards.
 */
export async function removeStoredImportInlineObjectsForBoardIds(
  boardIds: Types.ObjectId[]
): Promise<void> {
  if (boardIds.length === 0) {
    return;
  }

  await removeImportInlineObjectsForCardsMatching({ boardId: { $in: boardIds } });
}

/**
 * Same as board-scoped cleanup, for cards in one or more lists (e.g. list delete).
 */
export async function removeStoredImportInlineObjectsForListIds(
  listIds: Types.ObjectId[]
): Promise<void> {
  if (listIds.length === 0) {
    return;
  }

  await removeImportInlineObjectsForCardsMatching({ listId: { $in: listIds } });
}

/**
 * Deletes import-inline objects referenced in a card’s stored description fields (single-card delete).
 */
export async function removeImportInlineObjectsForCardFields(
  description: string | undefined,
  descriptionHtml: string | undefined
): Promise<void> {
  const names = new Set<string>();
  collectImportInlineObjectNamesFromCardLean({ description, descriptionHtml }, names);
  await removeImportInlineObjectsByNames(names);
}

/**
 * Upload a Wekan-imported inline-button icon to the `import-inline` bucket.
 * Returns an API-relative URL path (GET /api/v1/import-inline/…).
 */
export async function uploadImportInlineImage(
  buffer: Buffer,
  mimeType: string,
  originalName?: string
): Promise<string> {
  const ext = resolveExtension(mimeType, originalName);
  if (ext == null || !ALLOWED_EXT.has(ext)) {
    throw new Error('Unsupported file type for import-inline image upload');
  }
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    throw new Error(`File exceeds maximum size of ${MAX_BYTES} bytes`);
  }

  const client = getMinIOClient();
  const id = crypto.randomUUID();
  const objectName = `${id}${ext}`;
  const rawMime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const contentType =
    rawMime && rawMime !== 'application/octet-stream' && rawMime !== 'binary/octet-stream'
      ? (mimeType.split(';')[0]?.trim() ?? 'application/octet-stream')
      : guessContentTypeFromName(`asset${ext}`);

  await client.putObject(BUCKET, objectName, buffer, buffer.length, {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=86400',
  });

  return `/api/v1/import-inline/${objectName}`;
}

export async function getImportInlineObjectStream(
  fileId: string
): Promise<{ stream: NodeJS.ReadableStream; contentType: string } | null> {
  const safeName = fileId.replace(/\\/g, '/').split('/').pop() ?? '';
  if (!/^[a-f0-9-]{36}\.(png|jpg|jpeg|webp|svg|ico)$/i.test(safeName)) {
    return null;
  }

  const client = getMinIOClient();
  try {
    const stat = await client.statObject(BUCKET, safeName);
    const stream = await client.getObject(BUCKET, safeName);
    const fromMeta = stat.metaData?.['content-type'] || stat.metaData?.['Content-Type'];
    const contentType = fromMeta || guessContentTypeFromName(safeName);
    return { stream, contentType };
  } catch (err: unknown) {
    if (isMinioNotFound(err)) {
      return null;
    }
    logger.warn({ err, safeName }, 'import-inline object get failed');
    throw err;
  }
}
