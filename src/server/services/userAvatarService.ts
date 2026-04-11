import { Readable } from 'node:stream';
import { getMinIOClient } from '../config/minio.js';

async function readableToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

const BUCKET_NAME = 'user-avatars';

function avatarObjectKey(userId: string): string {
  return `${userId}/avatar.webp`;
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function isAllowedAvatarMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime);
}

/** When the browser sends `application/octet-stream`, infer type from magic bytes. */
export function inferAvatarMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export async function deleteUserAvatar(userId: string): Promise<void> {
  const client = getMinIOClient();
  const key = avatarObjectKey(userId);
  try {
    await client.removeObject(BUCKET_NAME, key);
  } catch (error: unknown) {
    const err = error as { code?: string; name?: string; message?: string };
    const msg = typeof err.message === 'string' ? err.message : '';
    if (
      err.code === 'NotFound' ||
      err.name === 'NotFound' ||
      err.code === 'NoSuchKey' ||
      msg.includes('does not exist')
    ) {
      return;
    }
    throw error;
  }
}

export async function uploadUserAvatar(
  userId: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  if (!isAllowedAvatarMime(mimeType)) {
    throw new Error('Unsupported image type for avatar');
  }
  const client = getMinIOClient();
  const key = avatarObjectKey(userId);
  await client.putObject(BUCKET_NAME, key, buffer, buffer.length, {
    'Content-Type': mimeType,
    'X-Uploaded-By': userId,
  });
}

export async function getUserAvatarObject(
  userId: string
): Promise<{ stream: Readable; contentType: string } | null> {
  const client = getMinIOClient();
  const key = avatarObjectKey(userId);
  try {
    const sniffStream = await client.getPartialObject(BUCKET_NAME, key, 0, 64);
    const head = await readableToBuffer(sniffStream as Readable);
    const sniffed = inferAvatarMimeFromBuffer(head);

    const fullStream = await client.getObject(BUCKET_NAME, key);

    let contentType: string | null = sniffed;
    if (contentType === null) {
      try {
        const stat = await client.statObject(BUCKET_NAME, key);
        const meta = stat.metaData as Record<string, string> | undefined;
        const raw = meta?.['content-type'] ?? meta?.['Content-Type'] ?? '';
        if (raw.startsWith('image/')) {
          contentType = raw;
        }
      } catch {
        /* stat failed after object exists — fall through */
      }
    }

    return {
      stream: fullStream as Readable,
      contentType: contentType ?? 'image/jpeg',
    };
  } catch (error: unknown) {
    const err = error as { code?: string; name?: string; message?: string };
    const msg = typeof err.message === 'string' ? err.message : '';
    if (
      err.code === 'NotFound' ||
      err.name === 'NotFound' ||
      err.code === 'NoSuchKey' ||
      msg.includes('does not exist')
    ) {
      return null;
    }
    throw error;
  }
}
