import crypto from 'crypto';
import { MINIO_BUCKET_BRANDING } from '../../shared/constants/minioBuckets.js';
import { getMinIOClient, initializeMinIOBuckets } from '../config/minio.js';
import { logger } from '../utils/logger.js';
import { isBlockedSvgUpload } from '../../shared/utils/sanitizeHtml.js';
import {
  ValidationError,
} from '../../shared/errors/domainErrors.js';

initializeMinIOBuckets().catch((error) => {
  logger.error({ error }, 'Failed to initialize MinIO buckets (branding)');
});

const BUCKET = MINIO_BUCKET_BRANDING;

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

const LOGO_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
};

const FAVICON_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
  /** Non-standard but seen in the wild */
  'image/ico': '.ico',
};

const LOGO_ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
const FAVICON_ALLOWED_EXT = new Set(['.png', '.ico', '.svg', '.webp']);

function extForMime(
  mime: string,
  map: Record<string, string>
): string | null {
  const normalized = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return map[normalized] ?? null;
}

/**
 * Browsers often send `application/octet-stream` or an empty type for .ico / some PNGs.
 * Resolve a safe extension from the original filename when MIME is missing or generic.
 */
function extFromOriginalName(
  originalName: string | undefined,
  kind: BrandingUploadKind
): string | null {
  if (!originalName || typeof originalName !== 'string') {
    return null;
  }
  const base = originalName.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot < 0) {
    return null;
  }
  const extWithDot = base.slice(dot);
  const allowed = kind === 'favicon' ? FAVICON_ALLOWED_EXT : LOGO_ALLOWED_EXT;
  return allowed.has(extWithDot) ? extWithDot : null;
}

function resolveBrandingExtension(
  mimeType: string,
  kind: BrandingUploadKind,
  originalName: string | undefined
): string | null {
  const map =
    kind === 'favicon' ? FAVICON_MIME : LOGO_MIME;
  const fromMime = extForMime(mimeType, map);
  if (fromMime) {
    return fromMime;
  }
  return extFromOriginalName(originalName, kind);
}

export type BrandingUploadKind =
  | 'login-logo'
  | 'favicon'
  | 'home-nav-icon'
  | 'home-bg-image'
  | 'board-nav-icon';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_FAVICON_BYTES = 512 * 1024;
const MAX_HOME_BG_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Upload a branding asset to the public branding bucket. Returns API-relative URL path.
 */
export async function uploadBrandingAsset(
  buffer: Buffer,
  mimeType: string,
  kind: BrandingUploadKind,
  originalName?: string
): Promise<string> {
  const client = getMinIOClient();
  const rawMime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (isBlockedSvgUpload(rawMime, originalName)) {
    throw new ValidationError('SVG uploads are not allowed for branding assets');
  }

  const ext = resolveBrandingExtension(mimeType, kind, originalName);

  if (!ext) {
    throw new Error(
      'Unsupported file type for branding upload (check file extension and image format)'
    );
  }

  const max =
    kind === 'favicon'
      ? MAX_FAVICON_BYTES
      : kind === 'home-bg-image'
        ? MAX_HOME_BG_IMAGE_BYTES
        : MAX_LOGO_BYTES;
  if (buffer.length > max) {
    throw new ValidationError(`File exceeds maximum size of ${max} bytes`);
  }

  const id = crypto.randomUUID();
  /** Flat key at bucket root (bucket name is already `branding`). Legacy nested keys still resolve on read/delete. */
  const objectName = `${id}${ext}`;
  const contentType =
    rawMime && rawMime !== 'application/octet-stream' && rawMime !== 'binary/octet-stream'
      ? rawMime
      : guessContentTypeFromName(`asset${ext}`);

  await client.putObject(BUCKET, objectName, buffer, buffer.length, {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=86400',
  });

  return `/api/v1/branding/${kind}/${id}${ext}`;
}

export async function getBrandingObjectStream(
  kind: BrandingUploadKind,
  fileName: string
): Promise<{ stream: NodeJS.ReadableStream; contentType: string } | null> {
  const safeName = fileName.replace(/\\/g, '/').split('/').pop() ?? '';
  if (!/^[a-f0-9-]{36}\.(png|jpg|jpeg|webp|svg|ico)$/i.test(safeName)) {
    return null;
  }

  const client = getMinIOClient();
  const candidates = [safeName, `${kind}/${safeName}`, `branding/${kind}/${safeName}`];

  for (const objectName of candidates) {
    try {
      const stat = await client.statObject(BUCKET, objectName);
      const stream = await client.getObject(BUCKET, objectName);
      const fromMeta =
        stat.metaData?.['content-type'] || stat.metaData?.['Content-Type'];
      const contentType = fromMeta || guessContentTypeFromName(safeName);
      return { stream, contentType };
    } catch {
      /* try legacy path without branding/ prefix */
    }
  }

  logger.warn({ kind, safeName }, 'Branding object not found');
  return null;
}

const BRANDING_DELETE_PATH =
  /^\/api\/v1\/branding\/(login-logo|favicon|home-nav-icon|home-bg-image|board-nav-icon)\/([a-f0-9-]{36}\.(png|jpg|jpeg|webp|svg|ico))$/i;

function pathnameFromInput(input: string): string {
  const t = input.trim();
  if (t.startsWith('http://') || t.startsWith('https://')) {
    try {
      return new URL(t).pathname;
    } catch {
      return '';
    }
  }
  return t.startsWith('/') ? t : `/${t}`;
}

function isMinioNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const code = (err as { code?: string }).code;
  return code === 'NotFound' || code === 'NoSuchKey';
}

/**
 * Removes a branding object from MinIO if present. Idempotent.
 * @returns true if an object was removed
 */
export async function deleteBrandingObjectByPublicUrl(input: string): Promise<boolean> {
  const path = pathnameFromInput(input);
  const m = path.match(BRANDING_DELETE_PATH);
  if (!m?.[1] || !m[2]) {
    throw new ValidationError('Invalid branding asset URL');
  }
  const kind = m[1] as BrandingUploadKind;
  const fileName = m[2];
  const candidates = [fileName, `${kind}/${fileName}`, `branding/${kind}/${fileName}`];
  const client = getMinIOClient();
  let removed = false;
  for (const objectName of candidates) {
    try {
      await client.removeObject(BUCKET, objectName);
      removed = true;
      break;
    } catch (err: unknown) {
      if (isMinioNotFound(err)) {
        continue;
      }
      throw err;
    }
  }
  return removed;
}
