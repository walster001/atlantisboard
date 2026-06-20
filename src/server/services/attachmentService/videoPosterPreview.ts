import sharp from 'sharp';
import { logger } from '../../utils/logger.js';
import type { VideoPosterPreviewPreset } from '../../../shared/videoPosterPreviewPreset.js';
import {
  ensureVideoPosterCached,
  readCachedVideoPosterBuffer,
} from './videoPosterCache.js';
import { isVideoContentType } from './videoPosterFrame.js';

const IMPORT_PLACEHOLDER_WIDTH = 320;
const IMPORT_PLACEHOLDER_HEIGHT = 192;

let cachedImportPlaceholderPreview: Buffer | null = null;

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

export async function getVideoAttachmentPosterPreviewBuffer(args: {
  readonly objectName: string;
  readonly contentType: string;
  readonly preset: VideoPosterPreviewPreset;
}): Promise<{ readonly buffer: Buffer; readonly contentType: 'image/jpeg' | 'image/webp' } | null> {
  if (!isVideoContentType(args.contentType)) {
    return null;
  }

  try {
    const cached = await readCachedVideoPosterBuffer(args.objectName);
    if (cached != null) {
      return cached;
    }

    const generated = await ensureVideoPosterCached({
      objectName: args.objectName,
      contentType: args.contentType,
    });
    if (generated) {
      const afterCache = await readCachedVideoPosterBuffer(args.objectName);
      if (afterCache != null) {
        return afterCache;
      }
    }

    logger.warn(
      { objectName: args.objectName, event: 'attachment.video_poster.ffmpeg_unavailable' },
      'ffmpeg frame extraction failed; falling back to import-style placeholder',
    );
    return getImportPlaceholderVideoPreviewBuffer(args.preset);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      { error: message, objectName: args.objectName, event: 'attachment.video_poster.failed' },
      'Failed to generate video poster preview',
    );
    return getImportPlaceholderVideoPreviewBuffer(args.preset);
  }
}

export { isVideoContentType } from './videoPosterFrame.js';
export { extractVideoFrameFromPresignedUrl, ffmpegMjpegQualityFromPreset } from './videoPosterFrame.js';
