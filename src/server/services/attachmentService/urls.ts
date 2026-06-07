import {
  getAttachmentDeliveryMode,
  getAttachmentSignedUrlTtlSec,
  isMinioPublicPresignConfigured,
  resolveAttachmentDeliveryKind,
} from '../../config/attachmentDelivery.js';
import { getMinIOPublicPresignClient } from '../../config/minio.js';
import { BUCKET_NAME, buildAttachmentProxyUrl } from './minioPaths.js';
import type { AttachmentObjectMeta, AttachmentStreamUrlResponse } from './types.js';

/**
 * Mint a short-lived presigned GET URL (browser uses MinIO host from MINIO_PUBLIC_*).
 */
export async function mintAttachmentReadUrl(
  objectName: string,
  ttlSec: number,
): Promise<{ readonly url: string; readonly expiresAt: string }> {
  const client = getMinIOPublicPresignClient();
  const url = await client.presignedGetObject(BUCKET_NAME, objectName, ttlSec);
  const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
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
