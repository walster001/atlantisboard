import {
  getAttachmentDeliveryMode,
  isMinioPublicPresignConfigured,
  resolveAttachmentDeliveryKind,
} from '../../config/attachmentDelivery.js';
import { buildAttachmentStreamUrl } from './urls.js';
import type { AttachmentObjectMeta } from './types.js';

export function shouldPresignRedirectAttachmentStream(args: {
  readonly contentType: string;
  readonly size: number;
  readonly hasImagePreviewQuery: boolean;
}): boolean {
  if (args.hasImagePreviewQuery) {
    return false;
  }
  if (!isMinioPublicPresignConfigured()) {
    return false;
  }
  return (
    resolveAttachmentDeliveryKind({
      mode: getAttachmentDeliveryMode(),
      contentType: args.contentType,
      size: args.size,
    }) === 'signed'
  );
}

/** After auth, redirect large/video attachments to a presigned MinIO URL so range reads bypass the app. */
export async function mintPresignedAttachmentRedirectUrl(
  attachmentId: string,
  objectMeta: AttachmentObjectMeta,
): Promise<string | null> {
  const stream = await buildAttachmentStreamUrl(attachmentId, objectMeta);
  if (stream.delivery !== 'signed') {
    return null;
  }
  const url = stream.url.trim();
  return url !== '' ? url : null;
}
