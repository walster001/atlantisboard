import { appendCardTileImagePreviewQuery } from './imagePreviewPreset.js';
import { appendVideoPosterPreviewQuery as appendVideoPosterPreviewQueryInner } from './videoPosterPreviewPreset.js';

/** Canonical authenticated attachment file proxy path. */
export const ATTACHMENT_FILE_PROXY_PATH =
  /^\/api\/v1\/attachments\/([^/?#]+)\/file$/i;

export function isAttachmentProxyFilePath(pathname: string): boolean {
  const trimmed = pathname.trim();
  const pathOnly = (trimmed.split('?')[0] ?? trimmed).split('#')[0] ?? trimmed;
  const normalized = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
  return ATTACHMENT_FILE_PROXY_PATH.test(normalized);
}

export function isAttachmentProxyFileUrl(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      return isAttachmentProxyFilePath(new URL(trimmed).pathname);
    } catch {
      return false;
    }
  }
  return isAttachmentProxyFilePath(trimmed);
}

/** Append list-cover preview query for attachment proxy URLs (kanban card covers). */
export function appendAttachmentListCoverPreviewQuery(url: string): string {
  if (!isAttachmentProxyFileUrl(url)) {
    return url.trim();
  }
  return appendCardTileImagePreviewQuery(url);
}

/** Append optimised video poster preview query for attachment proxy URLs. */
export function appendVideoPosterPreviewQuery(url: string): string {
  if (!isAttachmentProxyFileUrl(url)) {
    return url.trim();
  }
  return appendVideoPosterPreviewQueryInner(url);
}
