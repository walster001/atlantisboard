import { describe, expect, test } from 'bun:test';
import {
  discardPendingDescriptionMedia,
  descriptionJsonHasBlobUrls,
  findOrphanedBlobUrlsInDescriptionJson,
  flushPendingDescriptionMediaInJson,
  registerPendingDescriptionMediaFile,
} from '../src/client/utils/descriptionPendingMedia.js';
import { isValidCardDescriptionJsonString } from '../src/shared/validation/cardDescriptionDoc.js';
import { normalizeCardDescriptionAttachmentUrls } from '../src/shared/cardDescriptionAttachmentRefs.js';

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

  test('descriptionJsonHasBlobUrls detects staged media', () => {
    const jsonString = JSON.stringify({
      type: 'doc',
      content: [{ type: 'imageResize', attrs: { src: 'blob:http://localhost/abc' } }],
    });
    expect(descriptionJsonHasBlobUrls(jsonString)).toBe(true);
  });

  test('findOrphanedBlobUrlsInDescriptionJson flags unregistered blob URLs', () => {
    const registry = new Map<string, File>();
    const jsonString = JSON.stringify({
      type: 'doc',
      content: [{ type: 'imageResize', attrs: { src: 'blob:http://localhost/orphan' } }],
    });
    expect(findOrphanedBlobUrlsInDescriptionJson(jsonString, registry)).toEqual([
      'blob:http://localhost/orphan',
    ]);
  });

  test('normalized attachment file URLs pass server description validation', () => {
    const attId = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee1111';
    const jsonString = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'note' }] },
        { type: 'imageResize', attrs: { src: `/api/v1/attachments/${attId}/file`, alt: 'photo.png' } },
      ],
    });
    const normalized = normalizeCardDescriptionAttachmentUrls(jsonString);
    expect(isValidCardDescriptionJsonString(normalized)).toBe(true);
    expect(normalized).not.toContain('blob:');
  });
});
