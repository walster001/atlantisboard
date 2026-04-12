import { describe, expect, it } from 'bun:test';
import { isPlaceholderCardAttachment } from '../src/shared/cardAttachmentPlaceholder.js';

describe('isPlaceholderCardAttachment', () => {
  it('returns true when isPlaceholder is true even if url is set', () => {
    expect(
      isPlaceholderCardAttachment({
        isPlaceholder: true,
        url: 'https://example.com/card-attachments/x/y',
      }),
    ).toBe(true);
  });

  it('returns true when url is empty or whitespace', () => {
    expect(isPlaceholderCardAttachment({ url: '' })).toBe(true);
    expect(isPlaceholderCardAttachment({ url: '   ' })).toBe(true);
  });

  it('returns false when url is non-empty and isPlaceholder is not true', () => {
    expect(
      isPlaceholderCardAttachment({
        isPlaceholder: false,
        url: 'https://minio/card-attachments/a/b.png',
      }),
    ).toBe(false);
    expect(isPlaceholderCardAttachment({ url: '/card-attachments/a/b.png' })).toBe(false);
  });
});
