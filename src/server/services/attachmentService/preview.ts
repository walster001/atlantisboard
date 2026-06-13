import sharp from 'sharp';
import { logger } from '../../utils/logger.js';
import { readAttachmentObjectBytes } from './read.js';

function isPreviewableImageContentType(contentType: string): boolean {
  const normalized = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return normalized.startsWith('image/');
}

export async function getAttachmentPreviewBuffer(
  attachmentUrl: string,
  contentType: string,
  maxWidth: number,
  quality: number,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!isPreviewableImageContentType(contentType)) {
    return null;
  }
  const input = await readAttachmentObjectBytes(attachmentUrl);
  if (input == null) {
    return null;
  }
  try {
    const buffer = await sharp(input.buffer)
      .rotate()
      .resize({ width: maxWidth, fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    return { buffer, contentType: 'image/webp' };
  } catch (error: unknown) {
    logger.warn({ error, attachmentUrl }, 'Failed to generate attachment list-cover preview');
    return null;
  }
}
