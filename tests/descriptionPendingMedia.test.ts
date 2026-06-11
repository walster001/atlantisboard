import { describe, expect, test } from 'bun:test';
import {
  discardPendingDescriptionMedia,
  flushPendingDescriptionMediaInJson,
  registerPendingDescriptionMediaFile,
} from '../src/client/utils/descriptionPendingMedia.js';

describe('descriptionPendingMedia', () => {
  test('flushPendingDescriptionMediaInJson uploads and replaces blob URLs', async () => {
    const registry = new Map<string, File>();
    const file = new File(['image-bytes'], 'photo.png', { type: 'image/png' });
    const blobUrl = registerPendingDescriptionMediaFile(registry, file);
    const jsonString = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'imageResize',
          attrs: { src: blobUrl, alt: 'photo.png' },
        },
      ],
    });

    const uploaded: string[] = [];
    const result = await flushPendingDescriptionMediaInJson(jsonString, registry, async (uploadedFile) => {
      uploaded.push(uploadedFile.name);
      return '/api/v1/attachments/att-1/file';
    });

    expect(uploaded).toEqual(['photo.png']);
    expect(result).toContain('/api/v1/attachments/att-1/file');
    expect(result).not.toContain('blob:');
    expect(registry.size).toBe(0);
  });

  test('discardPendingDescriptionMedia clears registry without uploading', () => {
    const registry = new Map<string, File>();
    const file = new File(['video-bytes'], 'clip.mp4', { type: 'video/mp4' });
    registerPendingDescriptionMediaFile(registry, file);
    expect(registry.size).toBe(1);
    discardPendingDescriptionMedia(registry);
    expect(registry.size).toBe(0);
  });

  test('flushPendingDescriptionMediaInJson skips unreferenced blob URLs', async () => {
    const registry = new Map<string, File>();
    const file = new File(['image-bytes'], 'unused.png', { type: 'image/png' });
    registerPendingDescriptionMediaFile(registry, file);
    const jsonString = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });

    const result = await flushPendingDescriptionMediaInJson(jsonString, registry, async () => {
      throw new Error('should not upload');
    });

    expect(result).toBe(jsonString);
    expect(registry.size).toBe(0);
  });
});
