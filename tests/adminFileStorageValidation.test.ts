import { describe, expect, test } from 'bun:test';
import { MINIO_BUCKET_CARD_ATTACHMENTS } from '../src/shared/constants/minioBuckets.js';
import { ValidationError } from '../src/shared/errors/domainErrors.js';
import {
  assertAllowedBucket,
  assertFolderSegmentName,
  assertSafeObjectKey,
  buildFolderMarkerKey,
  buildObjectKey,
  normalizeStoragePrefix,
  sanitizeUploadFileName,
} from '../src/server/services/adminFileStorageService/validation.js';

describe('admin file storage validation', () => {
  test('assertAllowedBucket accepts known buckets', () => {
    expect(assertAllowedBucket(MINIO_BUCKET_CARD_ATTACHMENTS)).toBe(MINIO_BUCKET_CARD_ATTACHMENTS);
  });

  test('assertAllowedBucket rejects unknown buckets', () => {
    expect(() => assertAllowedBucket('not-a-bucket')).toThrow(ValidationError);
  });

  test('normalizeStoragePrefix trims slashes and adds trailing slash', () => {
    expect(normalizeStoragePrefix('/avatars/user/')).toBe('avatars/user/');
    expect(normalizeStoragePrefix('avatars/user')).toBe('avatars/user/');
    expect(normalizeStoragePrefix('')).toBe('');
  });

  test('normalizeStoragePrefix rejects traversal', () => {
    expect(() => normalizeStoragePrefix('../secret/')).toThrow(ValidationError);
  });

  test('assertSafeObjectKey rejects folder markers by default', () => {
    expect(assertSafeObjectKey('files/report.pdf')).toBe('files/report.pdf');
    expect(() => assertSafeObjectKey('folder/')).toThrow(ValidationError);
  });

  test('assertSafeObjectKey can allow folder markers', () => {
    expect(assertSafeObjectKey('folder/', { allowFolderMarker: true })).toBe('folder/');
  });

  test('assertFolderSegmentName validates folder names', () => {
    expect(assertFolderSegmentName('uploads-2026')).toBe('uploads-2026');
    expect(() => assertFolderSegmentName('../bad')).toThrow(ValidationError);
  });

  test('buildObjectKey joins prefix and file segment safely', () => {
    expect(buildObjectKey('avatars/', 'photo.png')).toBe('avatars/photo.png');
    expect(buildObjectKey('', 'photo.png')).toBe('photo.png');
  });

  test('buildFolderMarkerKey creates trailing slash marker', () => {
    expect(buildFolderMarkerKey('imports/', 'batch-1')).toBe('imports/batch-1/');
  });

  test('sanitizeUploadFileName keeps basename only', () => {
    expect(sanitizeUploadFileName('/tmp/evil/../notes.txt')).toBe('notes.txt');
    expect(() => sanitizeUploadFileName('../')).toThrow(ValidationError);
  });
});
