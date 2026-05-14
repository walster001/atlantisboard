import { isPlaceholderCardAttachment } from '../../shared/cardAttachmentPlaceholder.js';
import {
  cardCoverReferencesAttachment,
  stripAttachmentFromDescriptionJsonString,
} from '../../shared/cardDescriptionAttachmentRefs.js';
import { MINIO_BUCKET_CARD_ATTACHMENTS } from '../../shared/constants/minioBuckets.js';
import { getMinIOClient, initializeMinIOBuckets } from '../config/minio.js';
import { Card, type ICardAttachment } from '../models/Card.js';
import type { Types } from 'mongoose';
import { logger } from '../utils/logger.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { emitCardUpdatedRealtime } from '../utils/cardSocketEmit.js';
import crypto from 'crypto';
import { createReadStream } from 'node:fs';
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

export interface AttachmentObjectMeta {
  readonly objectName: string;
  readonly contentType: string;
  readonly size: number;
}

/** Stat + metadata only (no stream). Use with `openAttachmentReadStream` for ranged responses. */
export async function getAttachmentObjectMeta(attachmentUrl: string): Promise<AttachmentObjectMeta> {
  const client = getMinIOClient();
  const objectName = extractObjectNameFromAttachmentUrl(attachmentUrl);
  const stat = await client.statObject(BUCKET_NAME, objectName);
  const metadata = stat.metaData as Record<string, string> | undefined;
  const contentType =
    metadata?.['content-type'] ??
    metadata?.['Content-Type'] ??
    'application/octet-stream';
  return {
    objectName,
    contentType,
    size: stat.size,
  };
}

/**
 * Open a read stream for the stored object. Pass `range` for HTTP 206 partial content (required
 * for many mobile browsers when playing video from `<video src>`).
 */
export async function openAttachmentReadStream(
  objectName: string,
  range: { readonly start: number; readonly endInclusive: number } | null,
): Promise<Readable> {
  const client = getMinIOClient();
  if (range == null) {
    return client.getObject(BUCKET_NAME, objectName);
  }
  const byteLength = range.endInclusive - range.start + 1;
  return client.getPartialObject(BUCKET_NAME, objectName, range.start, byteLength);
}

/** Small uploads: buffer in memory. Large uploads: temp path written by multer disk storage. */
export type CardAttachmentUploadPayload =
  | { readonly kind: 'memory'; readonly buffer: Buffer }
  | { readonly kind: 'disk'; readonly path: string; readonly size: number };

function cardAttachmentPayloadBytes(file: CardAttachmentUploadPayload): number {
  return file.kind === 'memory' ? file.buffer.length : file.size;
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
  file: CardAttachmentUploadPayload,
  fileName: string,
  mimeType: string,
  userId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<FileUploadResult> {
  const client = getMinIOClient();
  const byteLength = cardAttachmentPayloadBytes(file);

  // Validate file size
  if (byteLength > MAX_CARD_ATTACHMENT_BYTES) {
    throw new Error(`File size exceeds maximum limit of ${MAX_CARD_ATTACHMENT_BYTES / (1024 * 1024)} MB`);
  }

  // Basic file type validation (malware scanning with Pompelmi to be implemented)
  // TODO: Install pompelmi package and enable malware scanning
  // For now, we validate file extensions and MIME types
  const allowedMimeTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg',
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

    // Get presigned URL for accessing the file
    const url = await client.presignedGetObject(BUCKET_NAME, objectName, 7 * 24 * 60 * 60); // 7 days expiry

    const result: FileUploadResult = {
      id: fileId,
      name: fileName,
      url,
      type: mimeType,
      size: byteLength,
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
      size: byteLength,
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
      metadata: { fileName, fileSize: byteLength, fileType: mimeType },
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

async function readStreamIntoBuffer(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buf.length;
    if (total > maxBytes) {
      throw new Error(`Attachment exceeds maximum size of ${maxBytes} bytes while duplicating card`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/**
 * Deep-copies each attachment into MinIO under `newCardId/<newAttachmentId>.<ext>` and returns
 * new embedded attachment rows (presigned URLs). Placeholders are copied with new ids only.
 */
export async function duplicateCardAttachmentsForNewCard(args: {
  readonly sourceAttachments: readonly ICardAttachment[];
  readonly newCardId: string;
}): Promise<ICardAttachment[]> {
  const { sourceAttachments, newCardId } = args;
  const client = getMinIOClient();
  const maxBytes = getCardAttachmentMaxBytes();
  const out: ICardAttachment[] = [];

  for (const att of sourceAttachments) {
    const newId = crypto.randomUUID();
    if (isPlaceholderCardAttachment(att)) {
      out.push({
        id: newId,
        name: att.name,
        url: typeof att.url === 'string' ? att.url : '',
        isPlaceholder: true,
        ...(typeof att.originalFileName === 'string' && att.originalFileName.trim() !== ''
          ? { originalFileName: att.originalFileName }
          : {}),
        type: att.type,
        size: att.size,
        uploadedAt: new Date(),
        uploadedBy: att.uploadedBy,
      });
      continue;
    }

    const srcObject = extractObjectNameFromAttachmentUrl(att.url);
    const extMatch = /\.([^.]+)$/.exec(att.name.trim());
    const ext = extMatch?.[1] ?? 'bin';
    const destObjectName = `${newCardId}/${newId}.${ext}`;
    const stream = await client.getObject(BUCKET_NAME, srcObject);
    const buf = await readStreamIntoBuffer(stream as Readable, maxBytes);
    await client.putObject(BUCKET_NAME, destObjectName, buf, buf.length, {
      'Content-Type': att.type,
      'X-Card-Id': newCardId,
      'X-Uploaded-By': String(att.uploadedBy),
      'X-File-Name': encodeURIComponent(att.name),
    });
    const url = await client.presignedGetObject(BUCKET_NAME, destObjectName, 7 * 24 * 60 * 60);
    out.push({
      id: newId,
      name: att.name,
      url,
      ...(typeof att.originalFileName === 'string' && att.originalFileName.trim() !== ''
        ? { originalFileName: att.originalFileName }
        : {}),
      type: att.type,
      size: att.size,
      uploadedAt: new Date(),
      uploadedBy: att.uploadedBy,
    });
  }

  return out;
}

