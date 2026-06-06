import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { isPlaceholderCardAttachment } from '../../../../shared/cardAttachmentPlaceholder.js';
import {
  CARD_ATTACHMENT_ORIGINAL_NAME_MAX_LENGTH,
} from '../../../../shared/constants/entityTextLimits.js';
import type { ICardAttachment } from '../../../models/Card.js';
import { parseDataUrl } from '../../../../shared/import/atlantisboardNormalize.js';
import type { NormalizedAtlantisboardExport } from '../../../../shared/import/atlantisboardNormalize.js';
import { uploadCardAttachment } from '../../attachmentService.js';
import { logger } from '../../../utils/logger.js';

type ExportedAttachment = NormalizedAtlantisboardExport['cards'][number]['attachments'][number];

export async function materializeAtlantisboardAttachments(params: {
  readonly cardId: string;
  readonly userId: string;
  readonly attachments: readonly ExportedAttachment[];
}): Promise<ICardAttachment[]> {
  const results: ICardAttachment[] = [];
  for (const attachment of params.attachments) {
    const storedName =
      attachment.name.trim().slice(0, CARD_ATTACHMENT_ORIGINAL_NAME_MAX_LENGTH) || 'attachment';
    const uploadedByRaw = attachment.uploadedBy?.trim() ?? params.userId;
    const uploadedBy = mongoose.Types.ObjectId.isValid(uploadedByRaw)
      ? new mongoose.Types.ObjectId(uploadedByRaw)
      : new mongoose.Types.ObjectId(params.userId);
    const uploadedAt = attachment.uploadedAt != null ? new Date(attachment.uploadedAt) : new Date();
    const mimeType =
      typeof attachment.mimeType === 'string' && attachment.mimeType.trim() !== ''
        ? attachment.mimeType.trim()
        : 'application/octet-stream';

    const url = typeof attachment.url === 'string' ? attachment.url.trim() : '';
    const shouldTryInline =
      url.startsWith('data:') && attachment.isPlaceholder !== true && !isPlaceholderCardAttachment({ url });

    if (shouldTryInline) {
      const parsed = parseDataUrl(url);
      if (parsed != null) {
        try {
          const uploaded = await uploadCardAttachment(
            params.cardId,
            { kind: 'memory', buffer: parsed.buffer },
            storedName,
            parsed.mimeType || mimeType,
            params.userId,
          );
          results.push({
            id: uploaded.id,
            name: uploaded.name,
            url: uploaded.url,
            type: uploaded.type,
            size: uploaded.size,
            uploadedAt: uploaded.uploadedAt,
            uploadedBy: new mongoose.Types.ObjectId(uploaded.uploadedBy),
            ...(attachment.originalFileName != null && attachment.originalFileName.trim() !== ''
              ? { originalFileName: attachment.originalFileName.trim() }
              : {}),
          });
          continue;
        } catch (error) {
          logger.warn({ error, cardId: params.cardId, attachmentId: attachment.id }, 'Failed to restore exported attachment');
        }
      }
    }

    results.push({
      id: crypto.randomUUID(),
      name: storedName,
      originalFileName:
        attachment.originalFileName?.trim() ||
        (storedName !== attachment.name.trim() ? attachment.name.trim() : storedName),
      url: '',
      isPlaceholder: true,
      type: mimeType,
      size: typeof attachment.size === 'number' ? attachment.size : 0,
      uploadedAt,
      uploadedBy,
    });
  }
  return results;
}
