import { describe, expect, test } from 'bun:test';
import {
  MINIO_BUCKET_CARD_ATTACHMENTS,
  MINIO_BUCKET_FONTS,
  MINIO_BUCKET_IMPORT_INLINE,
  type MinioBucketName,
} from '../src/shared/constants/minioBuckets.js';
import {
  countReferencedKeys,
  countScannedObjects,
  findOrphanedObjects,
  isFolderMarkerKey,
} from '../src/server/services/adminFileStorageService/orphanDiff.js';
import {
  boardBackgroundObjectKeyFromPublicUrl,
  brandingObjectKeysFromPublicUrl,
  cardAttachmentObjectKeyFromStoredUrl,
  markValidFontObjectKeyAsInUse,
  userAvatarObjectKeyFromProfilePicture,
} from '../src/server/services/adminFileStorageService/orphanReferences.js';

describe('admin file storage orphan diff', () => {
  test('isFolderMarkerKey detects trailing slash keys', () => {
    expect(isFolderMarkerKey('imports/')).toBe(true);
    expect(isFolderMarkerKey('file.png')).toBe(false);
  });

  test('findOrphanedObjects excludes referenced keys and folder markers', () => {
    const bucketObjects = new Map<MinioBucketName, { key: string; size: number }[]>([
      [
        MINIO_BUCKET_CARD_ATTACHMENTS,
        [
          { key: '507f1f77bcf86cd799439011/abc-123.pdf', size: 100 },
          { key: '507f1f77bcf86cd799439011/orphan.bin', size: 50 },
          { key: 'empty-folder/', size: 0 },
        ],
      ],
      [MINIO_BUCKET_IMPORT_INLINE, [{ key: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png', size: 20 }]],
    ]);
    const inUse = new Map<MinioBucketName, Set<string>>([
      [
        MINIO_BUCKET_CARD_ATTACHMENTS,
        new Set(['507f1f77bcf86cd799439011/abc-123.pdf']),
      ],
    ]);

    const orphans = findOrphanedObjects(bucketObjects, inUse);
    expect(orphans).toEqual([
      {
        bucket: MINIO_BUCKET_CARD_ATTACHMENTS,
        key: '507f1f77bcf86cd799439011/orphan.bin',
        size: 50,
      },
      {
        bucket: MINIO_BUCKET_IMPORT_INLINE,
        key: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png',
        size: 20,
      },
    ]);
  });

  test('countScannedObjects and countReferencedKeys aggregate totals', () => {
    const bucketObjects = new Map<MinioBucketName, { key: string; size: number }[]>([
      [MINIO_BUCKET_FONTS, [{ key: 'a.woff2', size: 1 }, { key: 'folder/', size: 0 }]],
    ]);
    const inUse = new Map<MinioBucketName, Set<string>>([[MINIO_BUCKET_FONTS, new Set(['a.woff2'])]]);

    expect(countScannedObjects(bucketObjects)).toBe(1);
    expect(countReferencedKeys(inUse)).toBe(1);
  });
});

describe('admin file storage orphan reference normalization', () => {
  test('brandingObjectKeysFromPublicUrl returns legacy candidate keys', () => {
    const keys = brandingObjectKeysFromPublicUrl(
      '/api/v1/branding/login-logo/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png',
    );
    expect(keys).toEqual([
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png',
      'login-logo/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png',
      'branding/login-logo/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png',
    ]);
  });

  test('boardBackgroundObjectKeyFromPublicUrl extracts object file name', () => {
    expect(
      boardBackgroundObjectKeyFromPublicUrl('/api/v1/board-backgrounds/bbbbbbbb-cccc-dddd-eeee-ffffffffffff.webp'),
    ).toBe('bbbbbbbb-cccc-dddd-eeee-ffffffffffff.webp');
  });

  test('userAvatarObjectKeyFromProfilePicture matches uploaded avatar URLs', () => {
    const userId = '507f1f77bcf86cd799439011';
    expect(
      userAvatarObjectKeyFromProfilePicture(`/api/v1/users/avatar/${userId}?sig=abc`, userId),
    ).toBe(`${userId}/avatar.webp`);
    expect(userAvatarObjectKeyFromProfilePicture('https://google.com/photo.jpg', userId)).toBeNull();
  });

  test('cardAttachmentObjectKeyFromStoredUrl accepts direct MinIO keys', () => {
    expect(
      cardAttachmentObjectKeyFromStoredUrl('507f1f77bcf86cd799439011/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pdf'),
    ).toBe('507f1f77bcf86cd799439011/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pdf');
    expect(cardAttachmentObjectKeyFromStoredUrl('/api/v1/attachments/abc/file')).toBeNull();
  });

  test('markValidFontObjectKeyAsInUse only tracks valid font object names', () => {
    const map = new Map<MinioBucketName, Set<string>>();
    markValidFontObjectKeyAsInUse(map, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.woff2');
    markValidFontObjectKeyAsInUse(map, 'not-a-font.txt');
    expect(map.get(MINIO_BUCKET_FONTS)).toEqual(
      new Set(['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.woff2']),
    );
  });
});
