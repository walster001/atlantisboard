import crypto from 'crypto';
import { MINIO_BUCKET_BACKGROUNDS } from '../../shared/constants/minioBuckets.js';
import { getMinIOClient, initializeMinIOBuckets } from '../config/minio.js';
import { logger } from '../utils/logger.js';

initializeMinIOBuckets().catch((error) => {
  logger.error({ error }, 'Failed to initialize MinIO buckets (board backgrounds)');
});

const BUCKET = MINIO_BUCKET_BACKGROUNDS;
const MAX_BACKGROUND_BYTES = 12 * 1024 * 1024;

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function guessContentTypeFromName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  return ext != null && map[ext] != null ? map[ext] : 'application/octet-stream';
}

function extFromOriginalName(originalName: string | undefined): string | null {
  if (typeof originalName !== 'string' || originalName.trim() === '') {
    return null;
  }
  const base = originalName.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  const dotIndex = base.lastIndexOf('.');
  if (dotIndex < 0) {
    return null;
  }
  const ext = base.slice(dotIndex);
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? ext : null;
}

function resolveExt(mimeType: string, originalName: string | undefined): string | null {
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const byMime = ALLOWED_MIME_TO_EXT[normalized];
  if (byMime != null) {
    return byMime;
  }
  return extFromOriginalName(originalName);
}

export async function uploadBoardBackgroundAsset(
  buffer: Buffer,
  mimeType: string,
  originalName?: string,
): Promise<string> {
  if (buffer.length > MAX_BACKGROUND_BYTES) {
    throw new Error(`Background image exceeds maximum size of ${MAX_BACKGROUND_BYTES} bytes`);
  }
  const ext = resolveExt(mimeType, originalName);
  if (ext == null) {
    throw new Error('Unsupported background image format. Use JPG, PNG, GIF, or WebP.');
  }
  const id = crypto.randomUUID();
  const objectName = `${id}${ext}`;
  const rawMime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const contentType =
    rawMime !== '' && rawMime !== 'application/octet-stream'
      ? rawMime
      : guessContentTypeFromName(`image${ext}`);

  await getMinIOClient().putObject(BUCKET, objectName, buffer, buffer.length, {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=86400',
  });
  return `/api/v1/board-backgrounds/${objectName}`;
}

export async function getBoardBackgroundObjectStream(
  fileName: string,
): Promise<{ stream: NodeJS.ReadableStream; contentType: string } | null> {
  const safeName = fileName.replace(/\\/g, '/').split('/').pop() ?? '';
  if (!/^[a-f0-9-]{36}\.(png|jpg|jpeg|webp|gif)$/i.test(safeName)) {
    return null;
  }
  const client = getMinIOClient();
  try {
    const stat = await client.statObject(BUCKET, safeName);
    const stream = await client.getObject(BUCKET, safeName);
    const fromMeta = stat.metaData?.['content-type'] ?? stat.metaData?.['Content-Type'];
    return { stream, contentType: fromMeta ?? guessContentTypeFromName(safeName) };
  } catch {
    return null;
  }
}

function pathnameFromInput(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      return new URL(trimmed).pathname;
    } catch {
      return '';
    }
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function isMinioNotFound(err: unknown): boolean {
  if (err == null || typeof err !== 'object') {
    return false;
  }
  const code = (err as { code?: string }).code;
  return code === 'NotFound' || code === 'NoSuchKey';
}

const BOARD_BACKGROUND_PATH = /^\/api\/v1\/board-backgrounds\/([a-f0-9-]{36}\.(png|jpg|jpeg|webp|gif))$/i;

export async function deleteBoardBackgroundByPublicUrl(url: string): Promise<boolean> {
  const pathname = pathnameFromInput(url);
  const match = pathname.match(BOARD_BACKGROUND_PATH);
  if (!match?.[1]) {
    return false;
  }
  const fileName = match[1];
  try {
    await getMinIOClient().removeObject(BUCKET, fileName);
    return true;
  } catch (err) {
    if (isMinioNotFound(err)) {
      return false;
    }
    throw err;
  }
}
