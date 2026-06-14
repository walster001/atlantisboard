import type { Client as MinIOClient } from 'minio';
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
import { recordBoardActivityDeferred } from '../boardActivityTracking.js';
import { emitCardUpdatedRealtime } from '../../utils/cardSocketEmit.js';
import { BUCKET_NAME, extractObjectNameFromAttachmentUrl } from './minioPaths.js';
import {
  NotFoundError,
} from '../../../shared/errors/domainErrors.js';

function resolveAttachmentObjectName(
  cardId: string,
  attachmentId: string,
  attachmentUrl: string,
): string | null {
  try {
    return extractObjectNameFromAttachmentUrl(attachmentUrl);
  } catch (error: unknown) {
    logger.warn(
      {
        error,
        cardId,
        attachmentId,
        attachmentUrl,
        event: 'attachment.delete.object_key_unresolved',
      },
      'Could not resolve MinIO object key for attachment delete; card metadata will still be removed',
    );
    return null;
  }
}

/**
 * Remove the blob after the card document is updated so HTTP delete returns promptly.
 * Failures are logged for orphan cleanup (admin file storage tools).
 */
export function scheduleAttachmentObjectRemoval(params: {
  readonly client: MinIOClient;
  readonly cardId: string;
  readonly attachmentId: string;
  readonly objectName: string;
}): void {
  const { client, cardId, attachmentId, objectName } = params;
  void client
    .removeObject(BUCKET_NAME, objectName)
    .then(() => {
      logger.info(
        {
          cardId,
          attachmentId,
          objectName,
          bucket: BUCKET_NAME,
          event: 'attachment.delete.minio_removed',
        },
        'MinIO object removed after attachment delete',
      );
    })
    .catch((error: unknown) => {
      logger.warn(
        {
          error,
          cardId,
          attachmentId,
          objectName,
          bucket: BUCKET_NAME,
          event: 'attachment.delete.minio_remove_failed',
        },
        'Failed to remove MinIO object after attachment delete (orphan cleanup may be needed)',
      );
    });
}

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

  const objectName = isPlaceholderCardAttachment(attachment)
    ? null
    : resolveAttachmentObjectName(cardId, attachmentId, attachment.url);

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

    card.attachments = card.attachments.filter((att) => att.id !== attachmentId);
    const coverRaw = typeof card.cover === 'string' ? card.cover : '';
    if (cardCoverReferencesAttachment(coverRaw, attachmentId, attachment.url)) {
      card.cover = '';
    }

    await card.save();
    await invalidateAttachmentLocationCache(attachmentId);
    emitCardUpdatedRealtime(card);

    logAuditEvent({
      userId,
      action: 'card.attachment.delete',
      resourceType: 'card',
      resourceId: cardId,
      metadata: { attachmentId, fileName: attachment.name },
      timestamp: new Date(),
    });

    recordBoardActivityDeferred({
      boardId: card.boardId.toString(),
      cardId,
      userId,
      category: 'attachments',
      type: 'attachment.deleted',
      description: `Attachment "${attachment.name}" deleted from "${card.title}"`,
      metadata: {
        entityId: attachmentId,
        entityName: attachment.name,
        cardId,
        cardTitle: card.title,
      },
    });

    logger.info(
      {
        cardId,
        attachmentId,
        fileName: attachment.name,
        objectName,
        event: 'attachment.delete.card_saved',
      },
      'Attachment removed from card',
    );

    if (objectName != null) {
      scheduleAttachmentObjectRemoval({
        client,
        cardId,
        attachmentId,
        objectName,
      });
    }
  } catch (error) {
    logger.error(
      {
        error,
        cardId,
        attachmentId,
        event: 'attachment.delete.failed',
      },
      'Error deleting attachment',
    );
    throw error;
  }
}
