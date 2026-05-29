import { extractAttachmentIdFromMediaSrc } from '../../shared/cardDescriptionAttachmentRefs.js';
import { api } from './api.js';

export type AttachmentDeliveryKind = 'signed' | 'proxy';

export interface AttachmentStreamUrlEntry {
  readonly url: string;
  readonly expiresAt: string;
  readonly delivery: AttachmentDeliveryKind;
}

const REFRESH_BEFORE_EXPIRY_MS = 60_000;

interface CacheEntry extends AttachmentStreamUrlEntry {
  refreshTimerId: ReturnType<typeof setTimeout> | null;
}

const memoryCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<AttachmentStreamUrlEntry>>();

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
    .then((data) => ({
      url: data.url,
      expiresAt: data.expiresAt,
      delivery: data.delivery,
    }))
    .finally(() => {
      inflight.delete(attachmentId);
    });
  inflight.set(attachmentId, promise);
  return promise;
}

function scheduleCacheRefresh(attachmentId: string, entry: AttachmentStreamUrlEntry): void {
  const prior = memoryCache.get(attachmentId);
  if (prior?.refreshTimerId != null) {
    clearTimeout(prior.refreshTimerId);
  }
  const refreshTimerId = setTimeout(() => {
    memoryCache.delete(attachmentId);
    void ensureAttachmentStreamUrl(attachmentId).catch(() => {});
  }, msUntilRefresh(entry.expiresAt));
  memoryCache.set(attachmentId, { ...entry, refreshTimerId });
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
    const entry = await ensureAttachmentStreamUrl(attachmentId);
    if (entry.delivery === 'signed' && entry.url.trim() !== '') {
      return entry.url;
    }
    return api.getAttachmentFileUrl(attachmentId);
  }
  return api.resolveAttachmentUrl(trimmed);
}
