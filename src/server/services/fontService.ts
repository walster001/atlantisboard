import crypto from 'crypto';
import { getMinIOClient, initializeMinIOBuckets } from '../config/minio.js';
import { logger } from '../utils/logger.js';
import {
  fontFamilyValueFromDisplayName,
  SYSTEM_UI_FONT_FAMILY,
} from '../../shared/types/customFonts.js';

initializeMinIOBuckets().catch((error) => {
  logger.error({ error }, 'Failed to initialize MinIO buckets (fonts)');
});

const BUCKET = 'fonts';
/** Variable TTFs and full families are often larger than static webfonts. */
const MAX_FONT_BYTES = 15 * 1024 * 1024;

const MIME_TO_EXT: Record<string, string> = {
  'font/woff2': '.woff2',
  'application/font-woff2': '.woff2',
  'font/woff': '.woff',
  'application/font-woff': '.woff',
  'application/x-font-woff': '.woff',
  'font/ttf': '.ttf',
  'font/sfnt': '.ttf',
  'application/font-sfnt': '.ttf',
  'application/x-font-sfnt': '.ttf',
  'application/x-font-ttf': '.ttf',
  'application/x-font-truetype': '.ttf',
  'application/x-truetype-font': '.ttf',
  'application/font-ttf': '.ttf',
  'application/vnd.ms-opentype': '.otf',
  'font/otf': '.otf',
  'application/x-font-otf': '.otf',
};

const ALLOWED_EXT = new Set(['.woff2', '.woff', '.ttf', '.otf']);

const FILE_NAME_RE = /^[a-f0-9-]{36}\.(woff2|woff|ttf|otf)$/i;

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

function resolveFontExtension(mimeType: string, originalName: string | undefined): string | null {
  const raw = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const fromMime = MIME_TO_EXT[raw];
  if (fromMime) {
    return fromMime;
  }
  return extFromOriginalName(originalName);
}

/**
 * OpenType / TrueType / WOFF signatures when MIME/filename are wrong (common for .ttf, including variable fonts).
 */
function sniffFontExtension(buffer: Buffer): string | null {
  if (buffer.length < 4) {
    return null;
  }
  const a0 = buffer[0];
  const a1 = buffer[1];
  const a2 = buffer[2];
  const a3 = buffer[3];
  if (a0 === 0x77 && a1 === 0x4f && a2 === 0x46 && a3 === 0x46) {
    return '.woff';
  }
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'wOF2') {
    return '.woff2';
  }
  const tag = buffer.toString('ascii', 0, 4);
  if (tag === 'OTTO') {
    return '.otf';
  }
  if (tag === 'true') {
    return '.ttf';
  }
  const be = buffer.readUInt32BE(0);
  if (be === 0x0001_0000) {
    return '.ttf';
  }
  return null;
}

function guessContentTypeFromName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    woff2: 'font/woff2',
    woff: 'font/woff',
    ttf: 'font/ttf',
    otf: 'font/otf',
  };
  return ext && map[ext] ? map[ext] : 'application/octet-stream';
}

export function isValidFontObjectKey(fileName: string): boolean {
  return FILE_NAME_RE.test(fileName.replace(/\\/g, '/').split('/').pop() ?? '');
}

export interface FontCatalogEntry {
  fileName: string;
  displayName: string;
  fontFamilyValue: string;
  url: string;
}

export async function uploadCustomFont(
  buffer: Buffer,
  mimeType: string,
  displayName: string,
  originalName?: string
): Promise<FontCatalogEntry> {
  let ext = resolveFontExtension(mimeType, originalName);
  if (!ext) {
    ext = sniffFontExtension(buffer);
  }
  if (!ext) {
    throw new Error(
      'Unsupported font type (use .woff2, .woff, .ttf, or .otf — variable-weight .ttf is supported)'
    );
  }
  if (buffer.length > MAX_FONT_BYTES) {
    throw new Error(`Font exceeds maximum size of ${MAX_FONT_BYTES} bytes`);
  }

  const id = crypto.randomUUID();
  const objectName = `${id}${ext}`;
  const client = getMinIOClient();
  const rawMime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const contentType =
    rawMime && rawMime !== 'application/octet-stream' && rawMime !== 'binary/octet-stream'
      ? (mimeType.split(';')[0]?.trim() ?? guessContentTypeFromName(objectName))
      : guessContentTypeFromName(objectName);

  const encodedDisplay = Buffer.from(displayName, 'utf8').toString('base64url');

  await client.putObject(BUCKET, objectName, buffer, buffer.length, {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000',
    'X-Amz-Meta-Display-Name-B64': encodedDisplay,
  });

  return {
    fileName: objectName,
    displayName,
    fontFamilyValue: fontFamilyValueFromDisplayName(displayName),
    url: `/api/v1/fonts/${objectName}`,
  };
}

function readDisplayNameFromMeta(meta: Record<string, string> | undefined): string | null {
  if (!meta) {
    return null;
  }
  const b64 =
    meta['x-amz-meta-display-name-b64'] ??
    meta['X-Amz-Meta-Display-Name-B64'] ??
    meta['display-name-b64'];
  if (!b64 || typeof b64 !== 'string') {
    return null;
  }
  try {
    return Buffer.from(b64, 'base64url').toString('utf8');
  } catch {
    try {
      return Buffer.from(b64, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }
}

function collectFontObjectKeys(client: ReturnType<typeof getMinIOClient>): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const keys: string[] = [];
    const stream = client.listObjectsV2(BUCKET, '', true, '');
    stream.on('data', (obj: { name?: string }) => {
      if (obj.name && !obj.name.endsWith('/')) {
        keys.push(obj.name);
      }
    });
    stream.on('end', () => resolve(keys));
    stream.on('error', reject);
  });
}

export async function listFontCatalog(): Promise<FontCatalogEntry[]> {
  const client = getMinIOClient();
  const keys = await collectFontObjectKeys(client);
  keys.sort((a, b) => a.localeCompare(b));
  const out: FontCatalogEntry[] = [];
  for (const name of keys) {
    if (!isValidFontObjectKey(name)) {
      continue;
    }
    try {
      const stat = await client.statObject(BUCKET, name);
      const display =
        readDisplayNameFromMeta(stat.metaData as Record<string, string> | undefined) ??
        name.replace(/\.[^/.]+$/, '');
      out.push({
        fileName: name,
        displayName: display,
        fontFamilyValue: fontFamilyValueFromDisplayName(display),
        url: `/api/v1/fonts/${name}`,
      });
    } catch (err) {
      logger.warn({ err, name }, 'Skipping font object (stat failed)');
    }
  }
  return out;
}

export async function deleteCustomFont(fileName: string): Promise<void> {
  if (!isValidFontObjectKey(fileName)) {
    throw new Error('Invalid font file name');
  }
  const client = getMinIOClient();
  await client.removeObject(BUCKET, fileName);
}

/**
 * `fontFamilyValue` for a stored object (before delete), for matching AdminConfig.defaultUiFontFamily.
 */
export async function resolveFontFamilyValueForObjectKey(
  fileName: string
): Promise<string | null> {
  if (!isValidFontObjectKey(fileName)) {
    return null;
  }
  const client = getMinIOClient();
  try {
    const stat = await client.statObject(BUCKET, fileName);
    const display =
      readDisplayNameFromMeta(stat.metaData as Record<string, string> | undefined) ??
      fileName.replace(/\.[^/.]+$/, '');
    return fontFamilyValueFromDisplayName(display);
  } catch {
    return null;
  }
}

/**
 * @returns `null` to clear stored default; normalized string to save.
 */
export async function normalizeDefaultUiFontFamilyInput(value: unknown): Promise<string | null> {
  if (value === null || (typeof value === 'string' && value.trim() === '')) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error('Invalid default UI font');
  }
  const t = value.trim();
  if (t === SYSTEM_UI_FONT_FAMILY) {
    return SYSTEM_UI_FONT_FAMILY;
  }
  const catalog = await listFontCatalog();
  const ok = catalog.some((e) => e.fontFamilyValue === t);
  if (!ok) {
    throw new Error('Default UI font must be System UI or an uploaded font');
  }
  return t;
}

export async function getFontObjectStream(
  fileName: string
): Promise<{ stream: NodeJS.ReadableStream; contentType: string } | null> {
  const safe = fileName.replace(/\\/g, '/').split('/').pop() ?? '';
  if (!isValidFontObjectKey(safe)) {
    return null;
  }
  const client = getMinIOClient();
  try {
    const stat = await client.statObject(BUCKET, safe);
    const stream = await client.getObject(BUCKET, safe);
    const fromMeta =
      stat.metaData?.['content-type'] || stat.metaData?.['Content-Type'];
    const contentType = fromMeta || guessContentTypeFromName(safe);
    return { stream, contentType };
  } catch {
    return null;
  }
}
