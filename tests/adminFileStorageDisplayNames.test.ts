/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test';
import {
  decodeXFileNameMetadata,
  resolveObjectDisplayName,
} from '../src/server/services/adminFileStorageService/enrichDisplayNames.js';
import { entryPrimaryLabel, entryShowsStorageKey } from '../src/client/components/admin/AdminFileStoragePanel/helpers.js';

describe('admin file storage display names', () => {
  test('decodeXFileNameMetadata decodes URI-encoded filenames', () => {
    expect(decodeXFileNameMetadata('Q1%20Report.pdf')).toBe('Q1 Report.pdf');
    expect(decodeXFileNameMetadata('plain-name.png')).toBe('plain-name.png');
    expect(decodeXFileNameMetadata('')).toBeUndefined();
  });

  test('resolveObjectDisplayName prefers card attachment name over metadata', () => {
    expect(
      resolveObjectDisplayName({
        cardAttachmentName: 'Board photo.jpg',
        metadataFileName: 'other.jpg',
      }),
    ).toBe('Board photo.jpg');
    expect(
      resolveObjectDisplayName({
        metadataFileName: 'Scan.pdf',
      }),
    ).toBe('Scan.pdf');
    expect(resolveObjectDisplayName({})).toBeUndefined();
  });

  test('entryPrimaryLabel and entryShowsStorageKey implement hybrid labels', () => {
    const entry = {
      name: '09764d5d-bf4d-4cb5-aa7a-08d4a6b73fe6.png',
      key: 'card1/09764d5d-bf4d-4cb5-aa7a-08d4a6b73fe6.png',
      isFolder: false,
      size: 1024,
      lastModified: null,
      contentType: 'image/png',
      displayName: 'Sprint screenshot.png',
    };

    expect(entryPrimaryLabel(entry)).toBe('Sprint screenshot.png');
    expect(entryShowsStorageKey(entry)).toBe(true);

    const plain = { ...entry, displayName: undefined };
    expect(entryPrimaryLabel(plain)).toBe(entry.name);
    expect(entryShowsStorageKey(plain)).toBe(false);
  });
});
