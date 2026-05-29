import { isPlaceholderCardAttachment } from '../../shared/cardAttachmentPlaceholder.js';
import {
  cardCoverReferencesAttachment,
  stripAttachmentFromDescriptionJsonString,
} from '../../shared/cardDescriptionAttachmentRefs.js';
import { MINIO_BUCKET_CARD_ATTACHMENTS } from '../../shared/constants/minioBuckets.js';
import {
  getAttachmentDeliveryMode,
  getAttachmentSignedUrlTtlSec,
  resolveAttachmentDeliveryKind,
  type AttachmentDeliveryKind,
} from '../config/attachmentDelivery.js';
import { CopyConditions } from 'minio';
import { getMinIOClient, getMinIOPublicPresignClient, initializeMinIOBuckets } from '../config/minio.js';
import { runWithConcurrency } from '../utils/asyncConcurrency.js';
import { invalidateAttachmentLocationCache } from './attachmentCache.js';
import { Card, type ICardAttachment } from '../models/Card.js';
import type { Types } from 'mongoose';
import { logger } from '../utils/logger.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { emitCardUpdatedRealtime } from '../utils/cardSocketEmit.js';
import crypto from 'crypto';
import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { getCardAttachmentMaxBytes } from '../constants/uploads.js';
import { scanUploadForMalware } from '../utils/uploadMalwareScan.js';
import { isBlockedSvgUpload } from '../utils/sanitizeHtml.js';

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

export interface AttachmentStreamUrlResponse {
  readonly url: string;
  readonly expiresAt: string;
  readonly delivery: AttachmentDeliveryKind;
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

export function buildAttachmentProxyUrl(attachmentId: string): string {
  return `/api/v1/attachments/${encodeURIComponent(attachmentId)}/file`;
}

export function publicAttachmentUrl(attachment: { readonly id: string; readonly url: string }): string {
  const trimmed = attachment.url.trim();
  if (trimmed.startsWith('/api/v1/attachments/')) {
    return trimmed.split('?')[0] ?? trimmed;
  }
  return buildAttachmentProxyUrl(attachment.id);
}

function extractObjectNameFromAttachmentUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed === '') {
    throw new Error('Attachment URL is empty');
  }

  if (trimmed.startsWith('/api/v1/attachments/')) {
    throw new Error('Cannot resolve MinIO object from proxy URL without attachment context');
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

export async function readAttachmentObjectBytes(
  attachmentUrl: string,
): Promise<{ readonly buffer: Buffer; readonly contentType: string } | null> {
  try {
    const meta = await getAttachmentObjectMeta(attachmentUrl);
    if (meta.size > MAX_CARD_ATTACHMENT_BYTES) {
      return null;
    }
    const stream = await openAttachmentReadStream(meta.objectName, null);
    const buffer = await readStreamIntoBuffer(stream, MAX_CARD_ATTACHMENT_BYTES);
    return { buffer, contentType: meta.contentType };
  } catch {
    return null;
  }
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
    throw new Error('SVG uploads are not allowed');
  }
  if (!allowedMimeTypes.has(normalizedMime)) {
    throw new Error(`File type not allowed: ${normalizedMime || 'unknown'}`);
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
      throw new Error('Card not found');
    }

    card.attachments.push({
      id: fileId,
      name: fileName,
      url: storedUrl,
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
  if (delivery === 'signed') {
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

const DUPLICATE_ATTACHMENT_COPY_CONCURRENCY = 12;

function attachmentExtensionFromName(name: string): string {
  const extMatch = /\.([^.]+)$/.exec(name.trim());
  return extMatch?.[1] ?? 'bin';
}

function clonePlaceholderAttachmentRow(att: ICardAttachment, newId: string): ICardAttachment {
  return {
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
  };
}

function clonedStorageAttachmentRow(
  att: ICardAttachment,
  newId: string,
  destObjectName: string,
): ICardAttachment {
  return {
    id: newId,
    name: att.name,
    url: destObjectName,
    ...(typeof att.originalFileName === 'string' && att.originalFileName.trim() !== ''
      ? { originalFileName: att.originalFileName }
      : {}),
    type: att.type,
    size: att.size,
    uploadedAt: new Date(),
    uploadedBy: att.uploadedBy,
  };
}

async function copyCardAttachmentObject(args: {
  readonly srcObject: string;
  readonly destObjectName: string;
  readonly newCardId: string;
  readonly att: ICardAttachment;
}): Promise<void> {
  const { srcObject, destObjectName, newCardId, att } = args;
  const client = getMinIOClient();
  const conditions = new CopyConditions();
  await client.copyObject(
    BUCKET_NAME,
    destObjectName,
    `/${BUCKET_NAME}/${srcObject}`,
    conditions,
    {
      'Content-Type': att.type,
      'X-Card-Id': newCardId,
      'X-Uploaded-By': String(att.uploadedBy),
      'X-File-Name': encodeURIComponent(att.name),
    },
  );
}

type StorageAttachmentCopyJob = {
  readonly att: ICardAttachment;
  readonly newId: string;
  readonly srcObject: string;
  readonly destObjectName: string;
};

/**
 * Deep-copies each attachment into MinIO under `newCardId/<newAttachmentId>.<ext>` and returns
 * new embedded attachment rows. Uses server-side copy when possible; placeholders get new ids only.
 */
export async function duplicateCardAttachmentsForNewCard(args: {
  readonly sourceAttachments: readonly ICardAttachment[];
  readonly newCardId: string;
}): Promise<ICardAttachment[]> {
  const { sourceAttachments, newCardId } = args;
  if (sourceAttachments.length === 0) {
    return [];
  }

  const out: ICardAttachment[] = new Array(sourceAttachments.length);
  const copyJobs: StorageAttachmentCopyJob[] = [];

  for (let i = 0; i < sourceAttachments.length; i += 1) {
    const att = sourceAttachments[i]!;
    const newId = crypto.randomUUID();
    if (isPlaceholderCardAttachment(att)) {
      out[i] = clonePlaceholderAttachmentRow(att, newId);
      continue;
    }
    const srcObject = extractObjectNameFromAttachmentUrl(att.url);
    const ext = attachmentExtensionFromName(att.name);
    const destObjectName = `${newCardId}/${newId}.${ext}`;
    copyJobs.push({ att, newId, srcObject, destObjectName });
    out[i] = clonedStorageAttachmentRow(att, newId, destObjectName);
  }

  await runWithConcurrency(copyJobs, DUPLICATE_ATTACHMENT_COPY_CONCURRENCY, async (job) => {
    await copyCardAttachmentObject({
      srcObject: job.srcObject,
      destObjectName: job.destObjectName,
      newCardId,
      att: job.att,
    });
  });

  return out;
}

/**
 * Duplicates attachments for many cards in one MinIO copy pool (faster than per-card sequential work).
 */
export async function duplicateCardAttachmentsForManyCards(
  items: ReadonlyArray<{
    readonly sourceAttachments: readonly ICardAttachment[];
    readonly newCardId: string;
  }>,
): Promise<ICardAttachment[][]> {
  if (items.length === 0) {
    return [];
  }

  const results: ICardAttachment[][] = items.map(() => []);
  const copyJobs: Array<StorageAttachmentCopyJob & { readonly newCardId: string }> = [];

  for (let cardIndex = 0; cardIndex < items.length; cardIndex += 1) {
    const item = items[cardIndex]!;
    const { sourceAttachments, newCardId } = item;
    const rows: ICardAttachment[] = new Array(sourceAttachments.length);
    for (let i = 0; i < sourceAttachments.length; i += 1) {
      const att = sourceAttachments[i]!;
      const newId = crypto.randomUUID();
      if (isPlaceholderCardAttachment(att)) {
        rows[i] = clonePlaceholderAttachmentRow(att, newId);
        continue;
      }
      const srcObject = extractObjectNameFromAttachmentUrl(att.url);
      const ext = attachmentExtensionFromName(att.name);
      const destObjectName = `${newCardId}/${newId}.${ext}`;
      copyJobs.push({ att, newId, srcObject, destObjectName, newCardId });
      rows[i] = clonedStorageAttachmentRow(att, newId, destObjectName);
    }
    results[cardIndex] = rows;
  }

  await runWithConcurrency(copyJobs, DUPLICATE_ATTACHMENT_COPY_CONCURRENCY, async (job) => {
    await copyCardAttachmentObject({
      srcObject: job.srcObject,
      destObjectName: job.destObjectName,
      newCardId: job.newCardId,
      att: job.att,
    });
  });

  return results;
}

