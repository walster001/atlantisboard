import { MINIO_BUCKET_CARD_ATTACHMENTS } from '../../../shared/constants/minioBuckets.js';
import { getMinIOClient, initializeMinIOBuckets } from '../../config/minio.js';
import { getCardAttachmentMaxBytes } from '../../constants/uploads.js';
import { logger } from '../../utils/logger.js';

// Ensure buckets exist on module load
initializeMinIOBuckets().catch((error) => {
  logger.error({ error }, 'Failed to initialize MinIO buckets');
});

/** Aligned with multipart `limits.fileSize` on the attachment route — see `getCardAttachmentMaxBytes`. */
export const MAX_CARD_ATTACHMENT_BYTES = getCardAttachmentMaxBytes();
export const BUCKET_NAME = MINIO_BUCKET_CARD_ATTACHMENTS;

export function buildAttachmentProxyUrl(attachmentId: string): string {
  return `/api/v1/attachments/${encodeURIComponent(attachmentId)}/file`;
}

export function publicAttachmentUrl(attachment: { readonly id: string; readonly url: string }): string {
  const trimmed = attachment.url.trim();
  if (trimmed.startsWith('/api/v1/attachments/')) {
    return trimmed.split('?')[0] ?? trimmed;
  }
  return buildAttachmentProxyUrl(attachment.id);
}

export function extractObjectNameFromAttachmentUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed === '') {
    throw new Error('Attachment URL is empty');
  }

  if (trimmed.startsWith('/api/v1/attachments/')) {
    throw new Error('Cannot resolve MinIO object from proxy URL without attachment context');
  }

  const parsePath = (pathLike: string): string => {
    const noQuery = (pathLike.split('?')[0] ?? pathLike).split('#')[0] ?? pathLike;
    const normalized = decodeURIComponent(noQuery).replace(/^\/+/, '');
    const withNoBucket = normalized.startsWith(`${BUCKET_NAME}/`)
      ? normalized.slice(BUCKET_NAME.length + 1)
      : normalized;
    const parts = withNoBucket.split('/').filter((p) => p.length > 0);
    if (parts.length < 2) {
      throw new Error('Could not extract object key from attachment URL');
    }
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  };

  try {
    const parsed = new URL(trimmed);
    return parsePath(parsed.pathname);
  } catch {
    return parsePath(trimmed);
  }
}

export { getMinIOClient };
