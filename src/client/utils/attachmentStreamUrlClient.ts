import { extractAttachmentIdFromMediaSrc } from '../../shared/cardDescriptionAttachmentRefs.js';
import { api } from './api.js';

export type AttachmentDeliveryKind = 'signed' | 'proxy';

export interface AttachmentStreamUrlEntry {
  readonly url: string;
  readonly expiresAt: string;
  readonly delivery: AttachmentDeliveryKind;
}

const REFRESH_BEFORE_EXPIRY_MS = 60_000;
const MAX_ATTACHMENT_STREAM_CACHE_ENTRIES = 128;

/** Docker/internal MinIO hostnames must never be used in browser media elements. */
function isInternalMinioMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return host === 'minio' || host === 'kanboard-minio' || host.endsWith('.internal');
  } catch {
    return false;
  }
}

function toProxyStreamEntry(attachmentId: string, expiresAt: string): AttachmentStreamUrlEntry {
  return {
    url: api.getAttachmentFileUrl(attachmentId),
    expiresAt,
    delivery: 'proxy',
  };
}

interface CacheEntry extends AttachmentStreamUrlEntry {
  refreshTimerId: ReturnType<typeof setTimeout> | null;
}

const memoryCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<AttachmentStreamUrlEntry>>();

function evictAttachmentStreamCacheEntry(attachmentId: string): void {
  const prior = memoryCache.get(attachmentId);
  if (prior?.refreshTimerId != null) {
    clearTimeout(prior.refreshTimerId);
  }
  memoryCache.delete(attachmentId);
}

export function clearAttachmentStreamCache(): void {
  for (const attachmentId of memoryCache.keys()) {
    evictAttachmentStreamCacheEntry(attachmentId);
  }
  inflight.clear();
}

function msUntilRefresh(expiresAt: string): number {
  const expiryMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiryMs)) {
    return REFRESH_BEFORE_EXPIRY_MS;
  }
  const refreshAt = expiryMs - REFRESH_BEFORE_EXPIRY_MS;
  return Math.max(0, refreshAt - Date.now());
}

async function fetchStreamUrl(attachmentId: string): Promise<AttachmentStreamUrlEntry> {
  const existing = inflight.get(attachmentId);
  if (existing) {
    return existing;
  }
  const promise = api
    .getAttachmentUrl(attachmentId)
    .then((data) => {
      if (data.delivery === 'signed' && isInternalMinioMediaUrl(data.url)) {
        return toProxyStreamEntry(attachmentId, data.expiresAt);
      }
      return {
        url: data.url,
        expiresAt: data.expiresAt,
        delivery: data.delivery,
      };
    })
    .finally(() => {
      inflight.delete(attachmentId);
    });
  inflight.set(attachmentId, promise);
  return promise;
}

function scheduleCacheRefresh(attachmentId: string, entry: AttachmentStreamUrlEntry): void {
  evictAttachmentStreamCacheEntry(attachmentId);
  const refreshTimerId = setTimeout(() => {
    evictAttachmentStreamCacheEntry(attachmentId);
    void ensureAttachmentStreamUrl(attachmentId).catch(() => {});
  }, msUntilRefresh(entry.expiresAt));
  memoryCache.set(attachmentId, { ...entry, refreshTimerId });
  while (memoryCache.size > MAX_ATTACHMENT_STREAM_CACHE_ENTRIES) {
    const first = memoryCache.keys().next().value;
    if (first === undefined) {
      break;
    }
    evictAttachmentStreamCacheEntry(first);
  }
}

/**
 * Resolves authenticated stream URL (presigned MinIO or API proxy) for an attachment id.
 */
export async function ensureAttachmentStreamUrl(attachmentId: string): Promise<AttachmentStreamUrlEntry> {
  const cached = memoryCache.get(attachmentId);
  if (cached != null && msUntilRefresh(cached.expiresAt) > 0) {
    return cached;
  }
  const entry = await fetchStreamUrl(attachmentId);
  scheduleCacheRefresh(attachmentId, entry);
  return entry;
}

export function peekAttachmentStreamUrl(attachmentId: string): string | null {
  const cached = memoryCache.get(attachmentId);
  if (cached == null || msUntilRefresh(cached.expiresAt) <= 0) {
    return null;
  }
  return cached.url;
}

/**
 * Card description videos store `/api/v1/attachments/:id/file` — resolve to the current delivery URL.
 */
export async function resolveCardDescriptionVideoPlaybackUrl(storedSrc: string): Promise<string> {
  const trimmed = storedSrc.trim();
  if (trimmed === '') {
    return '';
  }
  const attachmentId = extractAttachmentIdFromMediaSrc(trimmed);
  if (attachmentId != null) {
    return resolveVideoAttachmentPlaybackUrl(attachmentId);
  }
  return api.resolveAttachmentUrl(trimmed);
}

/** Prefer presigned MinIO for video attachments; API proxy is only a last-resort fallback. */
export async function resolveVideoAttachmentPlaybackUrl(attachmentId: string): Promise<string> {
  const entry = await ensureAttachmentStreamUrl(attachmentId);
  if (entry.delivery === 'signed' && entry.url.trim() !== '') {
    return entry.url;
  }
  return api.getAttachmentFileUrl(attachmentId);
}
