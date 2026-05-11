import { isPlaceholderCardAttachment } from '../../shared/cardAttachmentPlaceholder.js';
import { stripAttachmentFromDescriptionJsonString } from '../../shared/cardDescriptionAttachmentRefs.js';
import { MINIO_BUCKET_CARD_ATTACHMENTS } from '../../shared/constants/minioBuckets.js';
import { getMinIOClient, initializeMinIOBuckets } from '../config/minio.js';
import { Card } from '../models/Card.js';
import type { Types } from 'mongoose';
import { logger } from '../utils/logger.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { emitCardUpdatedRealtime } from '../utils/cardSocketEmit.js';
import crypto from 'crypto';
import type { Readable } from 'node:stream';
import { getCardAttachmentMaxBytes } from '../constants/uploads.js';
// Malware scanning - TODO: Install and configure Pompelmi library
// For now, we'll do basic file type validation

export interface FileUploadResult {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  uploadedAt: Date;
  uploadedBy: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface AttachmentObjectResult {
  stream: Readable;
  contentType: string;
}

// Ensure buckets exist on module load
initializeMinIOBuckets().catch((error) => {
  logger.error({ error }, 'Failed to initialize MinIO buckets');
});

/** Aligned with multipart `limits.fileSize` on the attachment route — see `getCardAttachmentMaxBytes`. */
export const MAX_CARD_ATTACHMENT_BYTES = getCardAttachmentMaxBytes();
const BUCKET_NAME = MINIO_BUCKET_CARD_ATTACHMENTS;

function extractObjectNameFromAttachmentUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed === '') {
    throw new Error('Attachment URL is empty');
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

/**
 * Removes stored MinIO objects for non-placeholder attachments on cards in the given boards.
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
 * Upload file to MinIO for card attachment
 */
export async function uploadCardAttachment(
  cardId: string,
  file: Buffer,
  fileName: string,
  mimeType: string,
  userId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<FileUploadResult> {
  const client = getMinIOClient();

  // Validate file size
  if (file.length > MAX_CARD_ATTACHMENT_BYTES) {
    throw new Error(`File size exceeds maximum limit of ${MAX_CARD_ATTACHMENT_BYTES / (1024 * 1024)} MB`);
  }

  // Basic file type validation (malware scanning with Pompelmi to be implemented)
  // TODO: Install pompelmi package and enable malware scanning
  // For now, we validate file extensions and MIME types
  const allowedMimeTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'text/plain', 'text/csv', 'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ];
  
  if (mimeType && !allowedMimeTypes.includes(mimeType)) {
    logger.warn({ fileName, mimeType }, 'File type not in allowed list, proceeding with warning');
    // Allow upload but log warning - in production, implement proper malware scanning
  }

  // Generate unique file ID
  const fileId = crypto.randomUUID();
  const fileExtension = fileName.split('.').pop() || '';
  const objectName = `${cardId}/${fileId}.${fileExtension}`;

    // Upload to MinIO
    try {
      // Note: MinIO SDK doesn't have built-in progress tracking
      // For production with resumable.js or TUS protocol, implement proper progress tracking
      if (onProgress) {
        // Simulate initial progress
        onProgress({
          loaded: 0,
          total: file.length,
          percentage: 0,
        });
      }

      await client.putObject(BUCKET_NAME, objectName, Buffer.from(file), file.length, {
        'Content-Type': mimeType,
        'X-Card-Id': cardId,
        'X-Uploaded-By': userId,
        'X-File-Name': encodeURIComponent(fileName),
      });

      // Simulate completion progress
      if (onProgress) {
        onProgress({
          loaded: file.length,
          total: file.length,
          percentage: 100,
        });
      }

    // Get presigned URL for accessing the file
    const url = await client.presignedGetObject(BUCKET_NAME, objectName, 7 * 24 * 60 * 60); // 7 days expiry

    const result: FileUploadResult = {
      id: fileId,
      name: fileName,
      url,
      type: mimeType,
      size: file.length,
      uploadedAt: new Date(),
      uploadedBy: userId,
    };

    // Add attachment to card
    const card = await Card.findById(cardId);
    if (!card) {
      throw new Error('Card not found');
    }

    card.attachments.push({
      id: fileId,
      name: fileName,
      url,
      isPlaceholder: false,
      type: mimeType,
      size: file.length,
      uploadedAt: new Date(),
      uploadedBy: userId as unknown as typeof card.createdBy,
    });

    await card.save();

    emitCardUpdatedRealtime(card);

    logAuditEvent({
      userId,
      action: 'card.attachment.upload',
      resourceType: 'card',
      resourceId: cardId,
      metadata: { fileName, fileSize: file.length, fileType: mimeType },
      timestamp: new Date(),
    });

    logger.info({ cardId, fileName, fileId }, 'File uploaded successfully');

    return result;
  } catch (error) {
    logger.error({ error, cardId, fileName }, 'Error uploading file');
    throw error;
  }
}

/**
 * Delete card attachment
 */
export async function deleteCardAttachment(
  cardId: string,
  attachmentId: string,
  userId: string
): Promise<void> {
  const client = getMinIOClient();
  const card = await Card.findById(cardId);

  if (!card) {
    throw new Error('Card not found');
  }

  const attachment = card.attachments.find((att) => att.id === attachmentId);
  if (!attachment) {
    throw new Error('Attachment not found');
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

    // Remove from card
    card.attachments = card.attachments.filter((att) => att.id !== attachmentId);
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

/**
 * Get presigned URL for attachment download
 */
export async function getAttachmentUrl(attachmentUrl: string): Promise<string> {
  const client = getMinIOClient();
  const objectName = extractObjectNameFromAttachmentUrl(attachmentUrl);

  try {
    const url = await client.presignedGetObject(BUCKET_NAME, objectName, 7 * 24 * 60 * 60); // 7 days
    return url;
  } catch (error) {
    logger.error({ error, attachmentUrl }, 'Error generating presigned URL');
    throw error;
  }
}

export async function getAttachmentObject(attachmentUrl: string): Promise<AttachmentObjectResult> {
  const client = getMinIOClient();
  const objectName = extractObjectNameFromAttachmentUrl(attachmentUrl);
  const stat = await client.statObject(BUCKET_NAME, objectName);
  const stream = await client.getObject(BUCKET_NAME, objectName);
  const metadata = stat.metaData as Record<string, string> | undefined;
  const contentType =
    metadata?.['content-type'] ??
    metadata?.['Content-Type'] ??
    'application/octet-stream';
  return {
    stream,
    contentType,
  };
}

