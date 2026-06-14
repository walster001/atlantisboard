import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { logger } from '../../utils/logger.js';
import { openAttachmentReadStream } from './read.js';
import type { VideoPosterPreviewPreset } from '../../../shared/videoPosterPreviewPreset.js';

const IMPORT_PLACEHOLDER_WIDTH = 320;
const IMPORT_PLACEHOLDER_HEIGHT = 192;

let cachedImportPlaceholderPreview: Buffer | null = null;

function isVideoContentType(contentType: string): boolean {
  const normalized = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return normalized.startsWith('video/');
}

async function optimizeRasterPreview(
  input: Buffer,
  preset: VideoPosterPreviewPreset,
): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({ width: preset.maxWidth, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: preset.quality })
    .toBuffer();
}

/** Dark thumbnail for import placeholders (no object in storage). */
export async function getImportPlaceholderVideoPreviewBuffer(
  preset: VideoPosterPreviewPreset,
): Promise<{ readonly buffer: Buffer; readonly contentType: 'image/webp' }> {
  if (cachedImportPlaceholderPreview != null) {
    return { buffer: cachedImportPlaceholderPreview, contentType: 'image/webp' };
  }
  const buffer = await sharp({
    create: {
      width: IMPORT_PLACEHOLDER_WIDTH,
      height: IMPORT_PLACEHOLDER_HEIGHT,
      channels: 3,
      background: { r: 20, g: 21, b: 23 },
    },
  })
    .webp({ quality: preset.quality })
    .toBuffer();
  cachedImportPlaceholderPreview = buffer;
  return { buffer, contentType: 'image/webp' };
}

async function writeObjectStreamToTempFile(
  objectName: string,
  maxBytes: number,
): Promise<string | null> {
  const tempPath = join(tmpdir(), `vid-poster-${randomUUID()}`);
  const stream = await openAttachmentReadStream(objectName, null);
  let total = 0;
  const writeStream = createWriteStream(tempPath);
  try {
    for await (const chunk of stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      total += buf.length;
      if (total > maxBytes) {
        writeStream.destroy();
        stream.destroy();
        await unlink(tempPath).catch(() => {});
        return null;
      }
      if (!writeStream.write(buf)) {
        await new Promise<void>((resolve) => writeStream.once('drain', resolve));
      }
    }
    writeStream.end();
    await new Promise<void>((resolve, reject) => {
      writeStream.once('finish', () => resolve());
      writeStream.once('error', reject);
    });
    return tempPath;
  } catch {
    writeStream.destroy();
    stream.destroy();
    await unlink(tempPath).catch(() => {});
    return null;
  }
}

async function extractVideoFrameBuffer(videoPath: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const proc = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        '0.1',
        '-i',
        videoPath,
        '-frames:v',
        '1',
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        'pipe:1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    proc.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    proc.on('error', () => {
      resolve(null);
    });

    proc.on('close', (code) => {
      if (code !== 0 || chunks.length === 0) {
        resolve(null);
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

export async function getVideoAttachmentPosterPreviewBuffer(args: {
  readonly objectName: string;
  readonly contentType: string;
  readonly size: number;
  readonly preset: VideoPosterPreviewPreset;
  readonly maxSourceBytes: number;
}): Promise<{ readonly buffer: Buffer; readonly contentType: 'image/webp' } | null> {
  if (!isVideoContentType(args.contentType)) {
    return null;
  }

  const tempPath = await writeObjectStreamToTempFile(args.objectName, args.maxSourceBytes);
  if (tempPath == null) {
    return null;
  }

  try {
    const frame = await extractVideoFrameBuffer(tempPath);
    if (frame == null) {
      logger.warn(
        { objectName: args.objectName, event: 'attachment.video_poster.ffmpeg_unavailable' },
        'ffmpeg frame extraction failed; falling back to import-style placeholder',
      );
      return getImportPlaceholderVideoPreviewBuffer(args.preset);
    }
    const buffer = await optimizeRasterPreview(frame, args.preset);
    return { buffer, contentType: 'image/webp' };
  } catch (error: unknown) {
    logger.warn(
      { error, objectName: args.objectName, event: 'attachment.video_poster.failed' },
      'Failed to generate video poster preview',
    );
    return getImportPlaceholderVideoPreviewBuffer(args.preset);
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

export { isVideoContentType };
