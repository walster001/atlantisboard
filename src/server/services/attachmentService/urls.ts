import {
  getAttachmentDeliveryMode,
  getAttachmentSignedUrlTtlSec,
  isMinioCdnProxyEnabled,
  isMinioPublicPresignConfigured,
  resolveAttachmentDeliveryKind,
  resolveAttachmentPublicBaseUrl,
} from '../../config/attachmentDelivery.js';
import { getMinIOClient, getMinIOPublicPresignClient } from '../../config/minio.js';
import { rewritePresignedUrlToPublicBase } from '../../utils/rewritePresignedMinioUrl.js';
import { BUCKET_NAME, buildAttachmentProxyUrl } from './minioPaths.js';
import type { AttachmentObjectMeta, AttachmentStreamUrlResponse } from './types.js';

/**
 * Presigned GET via internal MinIO endpoint — for server-side ffmpeg/ffprobe only.
 */
export async function mintAttachmentInternalReadUrl(
  objectName: string,
  ttlSec: number,
): Promise<{ readonly url: string; readonly expiresAt: string }> {
  const client = getMinIOClient();
  const url = await client.presignedGetObject(BUCKET_NAME, objectName, ttlSec);
  return {
    url,
    expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
}

/**
 * Mint a short-lived presigned GET URL (browser uses MinIO host from MINIO_PUBLIC_* or /cdn proxy).
 */
export async function mintAttachmentReadUrl(
  objectName: string,
  ttlSec: number,
): Promise<{ readonly url: string; readonly expiresAt: string }> {
  const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();

  if (isMinioCdnProxyEnabled()) {
    const publicBase = resolveAttachmentPublicBaseUrl();
    if (publicBase == null) {
      throw new Error('MinIO CDN public base URL is not configured');
    }
    const internalClient = getMinIOClient();
    const internalUrl = await internalClient.presignedGetObject(BUCKET_NAME, objectName, ttlSec);
    return {
      url: rewritePresignedUrlToPublicBase(internalUrl, publicBase),
      expiresAt,
    };
  }

  const client = getMinIOPublicPresignClient();
  const url = await client.presignedGetObject(BUCKET_NAME, objectName, ttlSec);
  return { url, expiresAt };
}

/**
 * Resolve stream URL for an attachment: presigned MinIO (signed/hybrid) or API proxy fallback.
 */
export async function buildAttachmentStreamUrl(
  attachmentId: string,
  objectMeta: AttachmentObjectMeta,
): Promise<AttachmentStreamUrlResponse> {
  const mode = getAttachmentDeliveryMode();
  const delivery = resolveAttachmentDeliveryKind({
    mode,
    contentType: objectMeta.contentType,
    size: objectMeta.size,
  });
  const ttlSec = getAttachmentSignedUrlTtlSec();
  if (delivery === 'signed' && isMinioPublicPresignConfigured()) {
    const minted = await mintAttachmentReadUrl(objectMeta.objectName, ttlSec);
    return { ...minted, delivery: 'signed' };
  }
  return {
    url: buildAttachmentProxyUrl(attachmentId),
    expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
    delivery: 'proxy',
  };
}

/**
 * Returns app-proxied stream URL (legacy presigned URLs are normalized on read).
 */
export async function getAttachmentUrl(attachmentUrl: string, attachmentId: string): Promise<string> {
  if (attachmentUrl.startsWith('/api/v1/attachments/')) {
    return attachmentUrl;
  }
  return buildAttachmentProxyUrl(attachmentId);
}
