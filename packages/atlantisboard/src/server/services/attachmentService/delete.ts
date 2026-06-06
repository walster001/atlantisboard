import { isPlaceholderCardAttachment } from '../../../shared/cardAttachmentPlaceholder.js';
import {
  cardCoverReferencesAttachment,
  stripAttachmentFromDescriptionJsonString,
} from '../../../shared/cardDescriptionAttachmentRefs.js';
import { getMinIOClient } from '../../config/minio.js';
import { invalidateAttachmentLocationCache } from '../attachmentCache.js';
import { Card } from '../../models/Card.js';
import { Types } from 'mongoose';
import { logger } from '../../utils/logger.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { emitCardUpdatedRealtime } from '../../utils/cardSocketEmit.js';
import { BUCKET_NAME, extractObjectNameFromAttachmentUrl } from './minioPaths.js';
import {
  NotFoundError,
} from '../../../shared/errors/domainErrors.js';

/**
 * Call before deleting card documents so URLs remain resolvable.
 * Per-object failures are logged and skipped so bulk deletion can continue.
 */
export async function removeStoredAttachmentObjectsForBoardIds(boardIds: Types.ObjectId[]): Promise<void> {
  if (boardIds.length === 0) {
    return;
  }
  const client = getMinIOClient();
  const cards = await Card.find({ boardId: { $in: boardIds } }).select('attachments').lean();
  for (const card of cards) {
    const cardId = String(card._id);
    for (const att of card.attachments ?? []) {
      if (isPlaceholderCardAttachment(att)) {
        continue;
      }
      try {
        const objectName = extractObjectNameFromAttachmentUrl(att.url);
        await client.removeObject(BUCKET_NAME, objectName);
      } catch (error: unknown) {
        logger.warn(
          { error, cardId, boardIds: boardIds.map((id) => id.toString()) },
          'Failed to remove MinIO object during board attachment cleanup',
        );
      }
    }
  }
}

/**
 * Delete card attachment
 */
export async function deleteCardAttachment(
  cardId: string,
  attachmentId: string,
  userId: string,
): Promise<void> {
  const client = getMinIOClient();
  const card = await Card.findById(cardId);

  if (!card) {
    throw new NotFoundError('Card not found');
  }

  const attachment = card.attachments.find((att) => att.id === attachmentId);
  if (!attachment) {
    throw new NotFoundError('Attachment not found');
  }

  try {
    const descriptionRaw = typeof card.description === 'string' ? card.description : '';
    const descriptionAfter = stripAttachmentFromDescriptionJsonString(
      descriptionRaw,
      attachmentId,
      attachment.url,
    );
    if (descriptionAfter !== descriptionRaw) {
      card.description = descriptionAfter;
    }

    if (!isPlaceholderCardAttachment(attachment)) {
      const objectName = extractObjectNameFromAttachmentUrl(attachment.url);
      await client.removeObject(BUCKET_NAME, objectName);
    }

    await invalidateAttachmentLocationCache(attachmentId);

    // Remove from card
    card.attachments = card.attachments.filter((att) => att.id !== attachmentId);
    const coverRaw = typeof card.cover === 'string' ? card.cover : '';
    if (cardCoverReferencesAttachment(coverRaw, attachmentId, attachment.url)) {
      card.cover = '';
    }
    await card.save();

    emitCardUpdatedRealtime(card);

    logAuditEvent({
      userId,
      action: 'card.attachment.delete',
      resourceType: 'card',
      resourceId: cardId,
      metadata: { attachmentId, fileName: attachment.name },
      timestamp: new Date(),
    });

    logger.info({ cardId, attachmentId }, 'Attachment deleted successfully');
  } catch (error) {
    logger.error({ error, cardId, attachmentId }, 'Error deleting attachment');
    throw error;
  }
}
