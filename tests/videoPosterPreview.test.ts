import { describe, expect, test } from 'bun:test';
import { getImportPlaceholderVideoPreviewBuffer } from '../src/server/services/attachmentService/videoPosterPreview.js';
import { videoPosterCacheObjectKey } from '../src/server/services/attachmentService/videoPosterCache.js';
import { VIDEO_POSTER_PREVIEW } from '../src/shared/videoPosterPreviewPreset.js';

describe('videoPosterPreview', () => {
  test('videoPosterCacheObjectKey derives sidecar path beside source video', () => {
    expect(videoPosterCacheObjectKey('card-1/video.mp4')).toBe('card-1/video.poster.jpg');
  });

  test('getImportPlaceholderVideoPreviewBuffer returns optimised webp', async () => {
    const preset = {
      maxWidth: VIDEO_POSTER_PREVIEW.maxWidth,
      quality: VIDEO_POSTER_PREVIEW.quality,
    };
    const first = await getImportPlaceholderVideoPreviewBuffer(preset);
    const second = await getImportPlaceholderVideoPreviewBuffer(preset);

    expect(first.contentType).toBe('image/webp');
    expect(first.buffer.byteLength).toBeGreaterThan(32);
    expect(first.buffer.byteLength).toBeLessThan(8_192);
    expect(second.buffer).toBe(first.buffer);
  });
});
