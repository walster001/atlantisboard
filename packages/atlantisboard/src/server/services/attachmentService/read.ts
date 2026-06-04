import { getMinIOClient } from '../../config/minio.js';
import type { Readable } from 'node:stream';
import {
  BUCKET_NAME,
  extractObjectNameFromAttachmentUrl,
  MAX_CARD_ATTACHMENT_BYTES,
} from './minioPaths.js';
import type { AttachmentObjectMeta } from './types.js';
import {
  ValidationError,
} from '../../../shared/errors/domainErrors.js';

async function readStreamIntoBuffer(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buf.length;
    if (total > maxBytes) {
      stream.destroy();
      throw new ValidationError(`Stream exceeds maximum size of ${maxBytes} bytes`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
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
