import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { getMinIOClient } from '../../config/minio.js';
import { logger } from '../../utils/logger.js';
import { BUCKET_NAME } from './minioPaths.js';
import type { VideoPosterPreviewPreset } from '../../../shared/videoPosterPreviewPreset.js';

const IMPORT_PLACEHOLDER_WIDTH = 320;
const IMPORT_PLACEHOLDER_HEIGHT = 192;
/** Short-lived presigned GET for ffmpeg poster extraction (internal MinIO URL). */
const POSTER_PRESIGN_TTL_SEC = 60;
/** Limit decode to the first second of media when extracting a poster frame. */
const POSTER_DECODE_MAX_SEC = 1;

let cachedImportPlaceholderPreview: Buffer | null = null;

function isVideoContentType(contentType: string): boolean {
  const normalized = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return normalized.startsWith('video/');
}

/** Map WebP-style quality (0–100) to ffmpeg MJPEG `-q:v` (2 = best, 31 = worst). */
function ffmpegMjpegQualityFromPreset(quality: number): number {
  const clamped = Math.max(1, Math.min(100, quality));
  return Math.max(2, Math.min(31, Math.round(2 + ((100 - clamped) * 29) / 100)));
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

/**
 * Extract one JPEG frame via ffmpeg at the video's native resolution — probes/decodes at most
 * {@link POSTER_DECODE_MAX_SEC} second(s) of media (no full-object download, no sharp resize).
 */
async function extractVideoFrameFromPresignedUrl(
  presignedUrl: string,
  jpegQuality: number,
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const proc = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-probesize',
        '32768',
        '-analyzeduration',
        '500000',
        '-ss',
        '0.1',
        '-t',
        String(POSTER_DECODE_MAX_SEC),
        '-i',
        presignedUrl,
        '-frames:v',
        '1',
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        '-q:v',
        String(jpegQuality),
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
  readonly preset: VideoPosterPreviewPreset;
}): Promise<{ readonly buffer: Buffer; readonly contentType: 'image/jpeg' | 'image/webp' } | null> {
  if (!isVideoContentType(args.contentType)) {
    return null;
  }

  try {
    const client = getMinIOClient();
    const presignedUrl = await client.presignedGetObject(
      BUCKET_NAME,
      args.objectName,
      POSTER_PRESIGN_TTL_SEC,
    );
    const jpegQuality = ffmpegMjpegQualityFromPreset(args.preset.quality);
    const frame = await extractVideoFrameFromPresignedUrl(presignedUrl, jpegQuality);
    if (frame == null) {
      logger.warn(
        { objectName: args.objectName, event: 'attachment.video_poster.ffmpeg_unavailable' },
        'ffmpeg frame extraction failed; falling back to import-style placeholder',
      );
      return getImportPlaceholderVideoPreviewBuffer(args.preset);
    }
    return { buffer: frame, contentType: 'image/jpeg' };
  } catch (error: unknown) {
    logger.warn(
      { error, objectName: args.objectName, event: 'attachment.video_poster.failed' },
      'Failed to generate video poster preview',
    );
    return getImportPlaceholderVideoPreviewBuffer(args.preset);
  }
}

export { isVideoContentType };
