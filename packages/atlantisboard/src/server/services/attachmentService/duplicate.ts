import { isPlaceholderCardAttachment } from '../../../shared/cardAttachmentPlaceholder.js';
import { runWithConcurrency } from '../../../shared/utils/runWithConcurrency.js';
import { CopyDestinationOptions, CopySourceOptions } from 'minio';
import { type ICardAttachment } from '../../models/Card.js';
import crypto from 'crypto';
import { BUCKET_NAME, extractObjectNameFromAttachmentUrl, getMinIOClient } from './minioPaths.js';
import {
  DUPLICATE_ATTACHMENT_COPY_CONCURRENCY,
  type StorageAttachmentCopyJob,
} from './types.js';

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
  const source = new CopySourceOptions({
    Bucket: BUCKET_NAME,
    Object: srcObject,
  });
  const dest = new CopyDestinationOptions({
    Bucket: BUCKET_NAME,
    Object: destObjectName,
    MetadataDirective: 'REPLACE',
    Headers: {
      'Content-Type': att.type,
    },
    UserMetadata: {
      'X-Card-Id': newCardId,
      'X-Uploaded-By': String(att.uploadedBy),
      'X-File-Name': encodeURIComponent(att.name),
    },
  });
  await client.copyObject(source, dest);
}

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
