import { describe, expect, test } from 'bun:test';
import {
  appendAttachmentListCoverPreviewQuery,
  appendVideoPosterPreviewQuery,
  isAttachmentProxyFileUrl,
} from '../src/shared/attachmentPreviewAsset.js';
import { resolveCardCoverRenderUrl } from '../src/client/components/board/sortableCardHelpers.js';
import type { CardDB } from '../src/client/store/database.js';

describe('attachmentPreviewAsset', () => {
  test('appendVideoPosterPreviewQuery adds preview=poster for attachment proxy URLs', () => {
    expect(
      appendVideoPosterPreviewQuery('/api/v1/attachments/507f1f77bcf86cd799439011/file'),
    ).toBe('/api/v1/attachments/507f1f77bcf86cd799439011/file?preview=poster');
  });

  test('appendAttachmentListCoverPreviewQuery adds preview=card for attachment proxy URLs', () => {
    expect(
      appendAttachmentListCoverPreviewQuery('/api/v1/attachments/507f1f77bcf86cd799439011/file'),
    ).toBe('/api/v1/attachments/507f1f77bcf86cd799439011/file?preview=card');
  });

  test('appendAttachmentListCoverPreviewQuery leaves external URLs unchanged', () => {
    const external = 'https://example.com/photo.jpg';
    expect(appendAttachmentListCoverPreviewQuery(external)).toBe(external);
    expect(isAttachmentProxyFileUrl(external)).toBe(false);
  });
});

describe('resolveCardCoverRenderUrl', () => {
  test('uses optimized preview URL for attachment-backed card covers', () => {
    const card = {
      cover: 'card-attachments/board/cover.webp',
      attachments: [
        {
          id: '507f1f77bcf86cd799439011',
          name: 'cover.webp',
          url: 'card-attachments/board/cover.webp',
          type: 'image/webp',
        },
      ],
    } as unknown as CardDB;

    expect(resolveCardCoverRenderUrl(card)).toBe(
      '/api/v1/attachments/507f1f77bcf86cd799439011/file?preview=card',
    );
  });
});
