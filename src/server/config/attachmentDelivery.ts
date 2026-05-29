/** Attachment stream delivery: presigned MinIO vs API proxy. */

export type AttachmentDeliveryMode = 'signed' | 'proxy' | 'hybrid';

export type AttachmentDeliveryKind = 'signed' | 'proxy';

const DEFAULT_SIGNED_URL_TTL_SEC = 900;
const MIN_SIGNED_URL_TTL_SEC = 60;
const MAX_SIGNED_URL_TTL_SEC = 3600;

/** Bytes above which hybrid mode prefers signed delivery (default 5 MiB). */
const DEFAULT_HYBRID_SIGNED_SIZE_BYTES = 5 * 1024 * 1024;

export function parseAttachmentDeliveryMode(raw: string | undefined): AttachmentDeliveryMode {
  const value = (raw ?? 'hybrid').trim().toLowerCase();
  if (value === 'signed' || value === 'proxy' || value === 'hybrid') {
    return value;
  }
  return 'hybrid';
}

export function getAttachmentDeliveryMode(): AttachmentDeliveryMode {
  return parseAttachmentDeliveryMode(process.env.ATTACHMENT_DELIVERY_MODE);
}

export function clampAttachmentSignedUrlTtlSec(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? String(DEFAULT_SIGNED_URL_TTL_SEC), 10);
  const ttl = Number.isFinite(parsed) ? parsed : DEFAULT_SIGNED_URL_TTL_SEC;
  return Math.min(MAX_SIGNED_URL_TTL_SEC, Math.max(MIN_SIGNED_URL_TTL_SEC, ttl));
}

export function getAttachmentSignedUrlTtlSec(): number {
  return clampAttachmentSignedUrlTtlSec(process.env.ATTACHMENT_SIGNED_URL_TTL_SEC);
}

function getHybridSignedSizeThresholdBytes(): number {
  const parsed = Number.parseInt(process.env.ATTACHMENT_HYBRID_SIGNED_MIN_BYTES ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_HYBRID_SIGNED_SIZE_BYTES;
}

/**
 * Whether this attachment should be delivered via a presigned MinIO URL (vs API proxy).
 */
export function resolveAttachmentDeliveryKind(args: {
  readonly mode: AttachmentDeliveryMode;
  readonly contentType: string;
  readonly size: number;
}): AttachmentDeliveryKind {
  const { mode, contentType, size } = args;
  if (mode === 'proxy') {
    return 'proxy';
  }
  if (mode === 'signed') {
    return 'signed';
  }
  const normalizedType = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (normalizedType.startsWith('video/')) {
    return 'signed';
  }
  if (normalizedType === 'application/pdf') {
    return 'proxy';
  }
  if (size >= getHybridSignedSizeThresholdBytes()) {
    return 'signed';
  }
  return 'proxy';
}

export function isSignedAttachmentDeliveryEnabled(): boolean {
  const mode = getAttachmentDeliveryMode();
  return mode === 'signed' || mode === 'hybrid';
}

/**
 * Browser-reachable MinIO origin for CSP (`media-src` / `connect-src`).
 * Derived from MINIO_PUBLIC_* when set, otherwise internal MINIO_*.
 */
export function getMinioPublicOrigin(): string | null {
  const endpoint = (process.env.MINIO_PUBLIC_ENDPOINT ?? process.env.MINIO_ENDPOINT ?? '').trim();
  if (endpoint === '') {
    return null;
  }
  const portRaw = process.env.MINIO_PUBLIC_PORT ?? process.env.MINIO_PORT ?? '9000';
  const port = Number.parseInt(portRaw, 10);
  const useSsl =
    process.env.MINIO_PUBLIC_USE_SSL === 'true' ||
    (process.env.MINIO_PUBLIC_USE_SSL === undefined && process.env.MINIO_USE_SSL === 'true');
  const protocol = useSsl ? 'https' : 'http';
  const host = endpoint.includes(':') ? endpoint : `${endpoint}:${Number.isFinite(port) ? port : 9000}`;
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}
