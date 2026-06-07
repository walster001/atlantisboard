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

export interface MinioPublicEndpointConfig {
  readonly endPoint: string;
  readonly port: number;
  readonly useSSL: boolean;
}

function normalizeHostname(host: string): string {
  const trimmed = host.trim().toLowerCase();
  const withoutPort = trimmed.split(':')[0] ?? trimmed;
  return withoutPort;
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Docker / cluster service names that browsers cannot resolve — never use in presigned URLs. */
function isUnresolvableMinioPublicHost(host: string): boolean {
  const normalized = normalizeHostname(host);
  return (
    normalized === 'minio' ||
    normalized === 'kanboard-minio' ||
    normalized.endsWith('.internal')
  );
}

function isSameAsInternalMinioEndpoint(publicHost: string): boolean {
  const internal = normalizeHostname(process.env.MINIO_ENDPOINT ?? 'localhost');
  const pub = normalizeHostname(publicHost);
  return pub === internal;
}

function defaultPublicUrlScheme(): 'http:' | 'https:' {
  return isProductionRuntime() ? 'https:' : 'http:';
}

function parsePublicUrlToEndpointConfig(raw: string): MinioPublicEndpointConfig | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  try {
    const withScheme = trimmed.includes('://')
      ? trimmed
      : `${defaultPublicUrlScheme()}//${trimmed}`;
    const url = new URL(withScheme);
    const useSSL = url.protocol === 'https:';
    const defaultPort = useSSL ? 443 : 80;
    const parsedPort = url.port !== '' ? Number.parseInt(url.port, 10) : defaultPort;
    const port = Number.isFinite(parsedPort) ? parsedPort : defaultPort;
    if (url.hostname === '') {
      return null;
    }
    return { endPoint: url.hostname, port, useSSL };
  } catch {
    return null;
  }
}

/**
 * Resolves browser-reachable MinIO endpoint for presigned URLs.
 * Uses `MINIO_PUBLIC_*`, or parses `S3_PUBLIC_URL` / `ATTACHMENT_PUBLIC_BASE` when set.
 * Never falls back to internal `MINIO_ENDPOINT` (e.g. Docker `minio:9000`).
 */
export function resolveMinioPublicEndpointConfig(): MinioPublicEndpointConfig | null {
  const explicitEndpoint = (process.env.MINIO_PUBLIC_ENDPOINT ?? '').trim();
  if (explicitEndpoint !== '') {
    const hostOnly = explicitEndpoint.includes(':')
      ? explicitEndpoint.split(':')[0] ?? explicitEndpoint
      : explicitEndpoint;
    const portRaw = process.env.MINIO_PUBLIC_PORT ?? process.env.MINIO_PORT ?? '9000';
    const port = Number.parseInt(portRaw, 10);
    const useSSL = process.env.MINIO_PUBLIC_USE_SSL === 'true';
    return {
      endPoint: hostOnly,
      port: Number.isFinite(port) ? port : 9000,
      useSSL,
    };
  }

  for (const alias of [
    process.env.S3_PUBLIC_URL,
    process.env.ATTACHMENT_PUBLIC_BASE,
  ]) {
    const fromUrl = parsePublicUrlToEndpointConfig(alias ?? '');
    if (fromUrl != null) {
      return fromUrl;
    }
  }

  return null;
}

/** True when a distinct, browser-reachable public MinIO endpoint is configured for presigning. */
export function isMinioPublicPresignConfigured(): boolean {
  const config = resolveMinioPublicEndpointConfig();
  if (config == null) {
    return false;
  }
  if (isUnresolvableMinioPublicHost(config.endPoint)) {
    return false;
  }
  // Production: public host must differ from internal service endpoint (avoid Docker-only hostnames).
  if (isProductionRuntime() && isSameAsInternalMinioEndpoint(config.endPoint)) {
    return false;
  }
  return true;
}

/**
 * Browser-reachable MinIO origin for CSP (`media-src` / `connect-src`).
 * Only set when a public endpoint is configured — never uses internal `MINIO_ENDPOINT`.
 */
export function getMinioPublicOrigin(): string | null {
  if (!isMinioPublicPresignConfigured()) {
    return null;
  }
  const config = resolveMinioPublicEndpointConfig();
  if (config == null) {
    return null;
  }
  const protocol = config.useSSL ? 'https' : 'http';
  const host =
    (config.useSSL && config.port === 443) || (!config.useSSL && config.port === 80)
      ? config.endPoint
      : `${config.endPoint}:${config.port}`;
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}
