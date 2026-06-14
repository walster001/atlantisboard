import { describe, expect, test } from 'bun:test';
import { resolveDescriptionDecorationImageSrc } from '../src/client/utils/descriptionDecorationImageSrc.js';

describe('resolveDescriptionDecorationImageSrc', () => {
  test('returns null for empty values', () => {
    expect(resolveDescriptionDecorationImageSrc(null)).toBeNull();
    expect(resolveDescriptionDecorationImageSrc('')).toBeNull();
    expect(resolveDescriptionDecorationImageSrc('   ')).toBeNull();
  });

  test('passes through blob preview URLs', () => {
    const blob = 'blob:http://localhost/abc-123';
    expect(resolveDescriptionDecorationImageSrc(blob)).toBe(blob);
  });

  test('normalizes attachment file URLs to proxy paths', () => {
    const attId = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee1111';
    expect(resolveDescriptionDecorationImageSrc(`/api/v1/attachments/${attId}/file`)).toBe(
      `/api/v1/attachments/${attId}/file`,
    );
  });
});
