import { describe, expect, test } from 'bun:test';
import type { CardDB } from '../src/client/store/database.js';
import {
  findStoryboardPreviewAttachment,
  isStoryboardImageAttachment,
  validateStoryboardImageFile,
} from '../src/client/components/board/visualStorytelling/storyboardImage.js';

type Attachment = NonNullable<CardDB['attachments']>[number];

function attachment(overrides: Partial<Attachment> & Pick<Attachment, 'id' | 'type'>): Attachment {
  return {
    id: overrides.id,
    name: overrides.name ?? `${overrides.id}.png`,
    url: overrides.url ?? `card-attachments/board/${overrides.id}.png`,
    type: overrides.type,
    size: overrides.size ?? 12,
    uploadedAt: overrides.uploadedAt ?? new Date(0),
    uploadedBy: overrides.uploadedBy ?? 'user-1',
    ...(overrides.originalFileName !== undefined
      ? { originalFileName: overrides.originalFileName }
      : {}),
    ...(overrides.isPlaceholder !== undefined ? { isPlaceholder: overrides.isPlaceholder } : {}),
    ...(overrides.scanStatus !== undefined ? { scanStatus: overrides.scanStatus } : {}),
  };
}

describe('findStoryboardPreviewAttachment', () => {
  test('prefers the cover image attachment over later images', () => {
    const cover = attachment({ id: 'cover-att', type: 'image/jpeg' });
    const extra = attachment({ id: 'other-att', type: 'image/png' });
    const found = findStoryboardPreviewAttachment({
      cover: `/api/v1/attachments/${cover.id}/file`,
      attachments: [extra, cover],
    });
    expect(found?.id).toBe('cover-att');
  });

  test('opens lightbox from cover URL when the board snapshot omitted attachments', () => {
    const found = findStoryboardPreviewAttachment({
      title: 'Hero',
      cover: '/api/v1/attachments/507f1f77bcf86cd799439011/file',
      attachments: [],
    });
    expect(found?.id).toBe('507f1f77bcf86cd799439011');
    expect(found?.type.startsWith('image/')).toBe(true);
  });

  test('falls back to the first viewable image when cover is empty', () => {
    const found = findStoryboardPreviewAttachment({
      cover: '',
      attachments: [
        attachment({ id: 'pdf', type: 'application/pdf' }),
        attachment({ id: 'hero', type: 'image/webp' }),
      ],
    });
    expect(found?.id).toBe('hero');
  });

  test('skips pending, infected, and placeholder rows', () => {
    const found = findStoryboardPreviewAttachment({
      cover: '',
      attachments: [
        attachment({ id: 'pending', type: 'image/png', scanStatus: 'pending' }),
        attachment({ id: 'bad', type: 'image/png', scanStatus: 'infected' }),
        attachment({ id: 'ph', type: 'image/png', isPlaceholder: true, url: '' }),
        attachment({ id: 'ok', type: 'image/png', scanStatus: 'clean' }),
      ],
    });
    expect(found?.id).toBe('ok');
  });
});

describe('validateStoryboardImageFile', () => {
  test('rejects non-images and oversized files', () => {
    const twoMb = 2 * 1024 * 1024;
    expect(validateStoryboardImageFile({ name: 'notes.txt', size: 10, type: 'text/plain' }, twoMb)).toBe(
      'Choose an image file.',
    );
    expect(
      validateStoryboardImageFile({ name: 'big.png', size: twoMb + 1, type: 'image/png' }, twoMb),
    ).toBe('File exceeds size limit of 2 MB: big.png');
    expect(validateStoryboardImageFile({ name: 'ok.png', size: 50, type: 'image/png' }, twoMb)).toBe(
      null,
    );
  });
});

describe('isStoryboardImageAttachment', () => {
  test('legacy attachments without scanStatus are viewable images', () => {
    expect(isStoryboardImageAttachment(attachment({ id: 'legacy', type: 'image/jpeg' }))).toBe(true);
  });
});
