import { getMinIOClient } from '../../config/minio.js';
import { Card } from '../../models/Card.js';
import { Types } from 'mongoose';
import { logger } from '../../utils/logger.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { recordBoardActivityDeferred } from '../boardActivityTracking.js';
import { emitCardUpdatedRealtime } from '../../utils/cardSocketEmit.js';
import crypto from 'crypto';
import { createReadStream } from 'node:fs';
import { scanUploadForMalware } from '../../utils/uploadMalwareScan.js';
import { isBlockedSvgUpload } from '../../utils/sanitizeHtml.js';
import {
  BUCKET_NAME,
  buildAttachmentProxyUrl,
  MAX_CARD_ATTACHMENT_BYTES,
} from './minioPaths.js';
import {
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/domainErrors.js';
import {
  cardAttachmentPayloadBytes,
  type CardAttachmentUploadPayload,
  type FileUploadResult,
  type UploadProgress,
} from './types.js';

/**
 * Upload file to MinIO for card attachment
 */
export async function uploadCardAttachment(
  cardId: string,
  file: CardAttachmentUploadPayload,
  fileName: string,
  mimeType: string,
  userId: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<FileUploadResult> {
  const client = getMinIOClient();
  const byteLength = cardAttachmentPayloadBytes(file);

  // Validate file size
  if (byteLength > MAX_CARD_ATTACHMENT_BYTES) {
    throw new ValidationError(`File size exceeds maximum limit of ${MAX_CARD_ATTACHMENT_BYTES / (1024 * 1024)} MB`);
  }

  const allowedMimeTypes = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg',
    'application/pdf',
    'text/plain', 'text/csv', 'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ]);

  const normalizedMime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (isBlockedSvgUpload(normalizedMime, fileName)) {
    throw new ValidationError('SVG uploads are not allowed');
  }
  if (!allowedMimeTypes.has(normalizedMime)) {
    throw new ValidationError(`File type not allowed: ${normalizedMime || 'unknown'}`);
  }

  await scanUploadForMalware(file, fileName, normalizedMime);

  // Generate unique file ID
  const fileId = crypto.randomUUID();
  const fileExtension = fileName.split('.').pop() || '';
  const objectName = `${cardId}/${fileId}.${fileExtension}`;

  const metaData = {
    'Content-Type': mimeType,
    'X-Card-Id': cardId,
    'X-Uploaded-By': userId,
    'X-File-Name': encodeURIComponent(fileName),
  };

  // Upload to MinIO
  try {
    // Note: MinIO SDK doesn't have built-in progress tracking
    // For production with resumable.js or TUS protocol, implement proper progress tracking
    if (onProgress) {
      onProgress({
        loaded: 0,
        total: byteLength,
        percentage: 0,
      });
    }

    if (file.kind === 'memory') {
      await client.putObject(BUCKET_NAME, objectName, file.buffer, file.buffer.length, metaData);
    } else {
      const stream = createReadStream(file.path);
      await client.putObject(BUCKET_NAME, objectName, stream, file.size, metaData);
    }

    if (onProgress) {
      onProgress({
        loaded: byteLength,
        total: byteLength,
        percentage: 100,
      });
    }

    // Internal MinIO object key (never expose presigned URLs to clients).
    const storedUrl = objectName;
    const publicUrl = buildAttachmentProxyUrl(fileId);

    const result: FileUploadResult = {
      id: fileId,
      name: fileName,
      url: publicUrl,
      type: mimeType,
      size: byteLength,
      uploadedAt: new Date(),
      uploadedBy: userId,
    };

    // Add attachment to card
    const card = await Card.findById(cardId);
    if (!card) {
      throw new NotFoundError('Card not found');
    }

    card.attachments.push({
      id: fileId,
      name: fileName,
      url: storedUrl,
      isPlaceholder: false,
      type: mimeType,
      size: byteLength,
      uploadedAt: new Date(),
      uploadedBy: new Types.ObjectId(userId),
    });

    await card.save();

    emitCardUpdatedRealtime(card);

    logAuditEvent({
      userId,
      action: 'card.attachment.upload',
      resourceType: 'card',
      resourceId: cardId,
      metadata: { fileName, fileSize: byteLength, fileType: mimeType },
      timestamp: new Date(),
    });

    recordBoardActivityDeferred({
      boardId: card.boardId.toString(),
      cardId,
      userId,
      category: 'attachments',
      type: 'attachment.uploaded',
      description: `Attachment "${fileName}" uploaded to "${card.title}"`,
      metadata: {
        entityId: fileId,
        entityName: fileName,
        cardId,
        cardTitle: card.title,
      },
    });

    logger.info({ cardId, fileName, fileId }, 'File uploaded successfully');

    return result;
  } catch (error) {
    logger.error({ error, cardId, fileName }, 'Error uploading file');
    throw error;
  }
}
