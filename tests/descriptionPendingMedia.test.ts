import { describe, expect, test } from 'bun:test';
import {
  discardPendingDescriptionMedia,
  descriptionJsonHasBlobUrls,
  findOrphanedBlobUrlsInDescriptionJson,
  flushPendingDescriptionMediaInJson,
  registerPendingDescriptionMediaFile,
  revokeDescriptionMediaBlobUrls,
  sanitizeCardDescriptionJsonForSave,
} from '../src/client/utils/descriptionPendingMedia.js';
import { buildAttachmentProxyMediaPath } from '../src/shared/cardDescriptionAttachmentRefs.js';
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
    const { jsonString: result, flushedBlobUrls } = await flushPendingDescriptionMediaInJson(
      jsonString,
      registry,
      async (uploadedFile) => {
        uploaded.push(uploadedFile.name);
        return '/api/v1/attachments/att-1/file';
      },
    );

    expect(uploaded).toEqual(['photo.png']);
    expect(result).toContain('/api/v1/attachments/att-1/file');
    expect(result).not.toContain('blob:');
    expect(flushedBlobUrls).toEqual([blobUrl]);
    expect(registry.size).toBe(0);
    revokeDescriptionMediaBlobUrls(flushedBlobUrls);
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

    const { jsonString: result, flushedBlobUrls } = await flushPendingDescriptionMediaInJson(
      jsonString,
      registry,
      async () => {
        throw new Error('should not upload');
      },
    );

    expect(result).toBe(jsonString);
    expect(flushedBlobUrls).toEqual([]);
    expect(registry.size).toBe(0);
  });

  test('flushPendingDescriptionMediaInJson defers blob revoke until caller releases flushed URLs', async () => {
    const registry = new Map<string, File>();
    const file = new File(['video-bytes'], 'clip.mp4', { type: 'video/mp4' });
    const blobUrl = registerPendingDescriptionMediaFile(registry, file);
    const jsonString = JSON.stringify({
      type: 'doc',
      content: [{ type: 'video', attrs: { src: blobUrl } }],
    });

    const { jsonString: result, flushedBlobUrls } = await flushPendingDescriptionMediaInJson(
      jsonString,
      registry,
      async () => '/api/v1/attachments/att-2/file',
    );

    expect(flushedBlobUrls).toEqual([blobUrl]);
    expect(result).not.toContain('blob:');
    const beforeRevoke = await fetch(blobUrl).then((response) => response.ok).catch(() => false);
    expect(beforeRevoke).toBe(true);
    revokeDescriptionMediaBlobUrls(flushedBlobUrls);
    const afterRevoke = await fetch(blobUrl).then((response) => response.ok).catch(() => false);
    expect(afterRevoke).toBe(false);
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

  test('video save pipeline accepts flushed localhost proxy paths', async () => {
    const attId = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee1111';
    const registry = new Map<string, File>();
    const file = new File(['video-bytes'], 'clip.mp4', { type: 'video/mp4' });
    const blobUrl = registerPendingDescriptionMediaFile(registry, file);
    const jsonString = JSON.stringify({
      type: 'doc',
      content: [{ type: 'video', attrs: { src: blobUrl, poster: null } }],
    });

    const { jsonString: flushed } = await flushPendingDescriptionMediaInJson(jsonString, registry, async () =>
      buildAttachmentProxyMediaPath(attId),
    );
    const sanitized = sanitizeCardDescriptionJsonForSave(flushed);
    const normalized = normalizeCardDescriptionAttachmentUrls(sanitized);
    expect(isValidCardDescriptionJsonString(normalized)).toBe(true);
    expect(normalized).toContain(`/api/v1/attachments/${attId}/file`);
    expect(normalized).not.toContain('blob:');
  });

  test('sanitizeCardDescriptionJsonForSave strips invalid video poster paths', () => {
    const attId = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee1111';
    const jsonString = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'video',
          attrs: {
            src: `/api/v1/attachments/${attId}/file`,
            poster: '/api/v1/attachments/poster-id',
          },
        },
      ],
    });
    const sanitized = sanitizeCardDescriptionJsonForSave(jsonString);
    const normalized = normalizeCardDescriptionAttachmentUrls(sanitized);
    expect(isValidCardDescriptionJsonString(normalized)).toBe(true);
    const parsed = JSON.parse(normalized) as {
      content: Array<{ attrs?: { poster?: string } }>;
    };
    expect(parsed.content[0]?.attrs?.poster).toBeUndefined();
  });

  test('sanitizeCardDescriptionJsonForSave rewrites localhost http autolinks to relative paths', () => {
    const attId = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee1111';
    const jsonString = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'local',
              marks: [{ type: 'link', attrs: { href: 'http://localhost:3000/boards/1' } }],
            },
          ],
        },
        { type: 'video', attrs: { src: `/api/v1/attachments/${attId}/file` } },
      ],
    });
    expect(isValidCardDescriptionJsonString(jsonString)).toBe(false);
    const sanitized = sanitizeCardDescriptionJsonForSave(jsonString);
    expect(isValidCardDescriptionJsonString(sanitized)).toBe(true);
    expect(sanitized).toContain('"/boards/1"');
    expect(sanitized).not.toContain('http://localhost:3000');
  });

  test('sanitizeCardDescriptionJsonForSave upgrades external http links to https', () => {
    const jsonString = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'example',
              marks: [{ type: 'link', attrs: { href: 'http://example.com/page' } }],
            },
          ],
        },
      ],
    });
    const sanitized = sanitizeCardDescriptionJsonForSave(jsonString);
    expect(isValidCardDescriptionJsonString(sanitized)).toBe(true);
    expect(sanitized).toContain('example');
    expect(sanitized).toContain('https://example.com/page');
    expect(sanitized).not.toContain('http://example.com');
  });

  test('sanitizeCardDescriptionJsonForSave drops media nodes with invalid src', () => {
    const jsonString = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Keep me' }] },
        { type: 'video', attrs: { src: '/api/v1/cards/c1/attachments', poster: null } },
        { type: 'video', attrs: { src: null, poster: null } },
      ],
    });
    const sanitized = sanitizeCardDescriptionJsonForSave(jsonString);
    expect(isValidCardDescriptionJsonString(sanitized)).toBe(true);
    expect(sanitized).toContain('Keep me');
    expect(sanitized).not.toContain('"video"');
  });

  async function runDescriptionSavePipeline(
    jsonString: string,
    registry: Map<string, File>,
  ): Promise<string> {
    let descriptionPayload = jsonString;
    if (registry.size > 0) {
      const flushed = await flushPendingDescriptionMediaInJson(jsonString, registry, async () =>
        buildAttachmentProxyMediaPath('aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee1111'),
      );
      descriptionPayload = flushed.jsonString;
    }
    descriptionPayload = sanitizeCardDescriptionJsonForSave(descriptionPayload);
    descriptionPayload = normalizeCardDescriptionAttachmentUrls(descriptionPayload);
    descriptionPayload = sanitizeCardDescriptionJsonForSave(descriptionPayload);
    return descriptionPayload;
  }

  test('description save pipeline accepts flushed image beside http inline button href', async () => {
    const registry = new Map<string, File>();
    const file = new File(['image-bytes'], 'photo.png', { type: 'image/png' });
    const blobUrl = registerPendingDescriptionMediaFile(registry, file);
    const jsonString = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'inlineButton',
          attrs: {
            href: 'http://example.com/docs',
            buttonText: 'Docs',
            textColor: '#ffffff',
            bgColor: '#228be6',
            borderRadiusPx: 8,
            iconSizePx: 24,
          },
        },
        { type: 'imageResize', attrs: { src: blobUrl, alt: 'photo.png' } },
      ],
    });
    expect(isValidCardDescriptionJsonString(jsonString)).toBe(false);
    const payload = await runDescriptionSavePipeline(jsonString, registry);
    expect(isValidCardDescriptionJsonString(payload)).toBe(true);
    expect(payload).toContain('/api/v1/attachments/aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee1111/file');
    expect(payload).toContain('https://example.com/docs');
    expect(payload).not.toContain('blob:');
  });

  test('description save pipeline accepts flushed video with text-only paragraph', async () => {
    const registry = new Map<string, File>();
    const file = new File(['video-bytes'], 'clip.mp4', { type: 'video/mp4' });
    const blobUrl = registerPendingDescriptionMediaFile(registry, file);
    const jsonString = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Notes after panel upload' }] },
        { type: 'video', attrs: { src: blobUrl, poster: null } },
      ],
    });
    const payload = await runDescriptionSavePipeline(jsonString, registry);
    expect(isValidCardDescriptionJsonString(payload)).toBe(true);
    expect(payload).toContain('Notes after panel upload');
    expect(payload).toContain('/api/v1/attachments/aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee1111/file');
  });

  test('sanitizeCardDescriptionJsonForSave clears invalid inline button iconSrc and upgrades href', () => {
    const jsonString = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'inlineButton',
          attrs: {
            href: 'http://localhost:3000/go',
            buttonText: 'Go',
            textColor: '#ffffff',
            bgColor: '#228be6',
            borderRadiusPx: 8,
            iconSizePx: 24,
            iconSrc: '',
          },
        },
      ],
    });
    const sanitized = sanitizeCardDescriptionJsonForSave(jsonString);
    expect(isValidCardDescriptionJsonString(sanitized)).toBe(true);
    expect(sanitized).not.toContain('"iconSrc"');
    expect(sanitized).toContain('"/go"');
  });
});
