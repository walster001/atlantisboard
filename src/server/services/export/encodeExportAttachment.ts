import { isPlaceholderCardAttachment } from '../../../shared/cardAttachmentPlaceholder.js';
import { isAttachmentViewable } from '../../../shared/attachmentScanStatus.js';
import { BOARD_EXPORT_INLINE_ATTACHMENT_MAX_BYTES } from '../../../shared/export/boardExportFormats.js';
import type { ICardAttachment } from '../../models/Card.js';
import { readAttachmentObjectBytes } from '../attachmentService.js';
import { logger } from '../../utils/logger.js';

export interface EncodedExportAttachment {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly uploadedAt: string;
  readonly uploadedBy: string;
  /** Portable URL — data URL when inlined, empty for placeholders / oversized files. */
  readonly url: string;
  readonly isPlaceholder: boolean;
  readonly originalFileName?: string;
}

function bufferToDataUrl(buffer: Buffer, mimeType: string): string {
  const safeMime = mimeType.trim() !== '' ? mimeType : 'application/octet-stream';
  return `data:${safeMime};base64,${buffer.toString('base64')}`;
}

export async function encodeExportAttachment(
  attachment: ICardAttachment,
): Promise<EncodedExportAttachment> {
  const uploadedAt =
    attachment.uploadedAt instanceof Date
      ? attachment.uploadedAt.toISOString()
      : new Date(attachment.uploadedAt).toISOString();
  const base: EncodedExportAttachment = {
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.type || 'application/octet-stream',
    size: attachment.size ?? 0,
    uploadedAt,
    uploadedBy: attachment.uploadedBy.toString(),
    url: '',
    isPlaceholder: isPlaceholderCardAttachment(attachment),
    ...(attachment.originalFileName != null ? { originalFileName: attachment.originalFileName } : {}),
  };

  if (isPlaceholderCardAttachment(attachment)) {
    return base;
  }

  if (!isAttachmentViewable(attachment.scanStatus)) {
    return base;
  }

  if (attachment.size > BOARD_EXPORT_INLINE_ATTACHMENT_MAX_BYTES) {
    return base;
  }

  try {
    const payload = await readAttachmentObjectBytes(attachment.url);
    if (payload == null) {
      return base;
    }
    if (payload.buffer.length > BOARD_EXPORT_INLINE_ATTACHMENT_MAX_BYTES) {
      return base;
    }
    return {
      ...base,
      url: bufferToDataUrl(payload.buffer, payload.contentType || attachment.type),
      isPlaceholder: false,
      size: payload.buffer.length,
    };
  } catch (error) {
    logger.warn({ error, attachmentId: attachment.id }, 'Could not inline attachment for export');
    return base;
  }
}

export async function encodeExportAttachments(
  attachments: readonly ICardAttachment[],
): Promise<EncodedExportAttachment[]> {
  return Promise.all(attachments.map((attachment) => encodeExportAttachment(attachment)));
}
