import {
  MINIO_BUCKET_BACKGROUNDS,
  MINIO_BUCKET_BRANDING,
  MINIO_BUCKET_CARD_ATTACHMENTS,
  MINIO_BUCKET_FONTS,
  MINIO_BUCKET_IMPORT_INLINE,
  MINIO_BUCKET_NAMES,
  MINIO_BUCKET_USER_AVATARS,
  type MinioBucketName,
} from '../../../shared/constants/minioBuckets.js';
import { ValidationError } from '../../../shared/errors/domainErrors.js';

const MAX_OBJECT_KEY_LENGTH = 1024;
const MAX_PREFIX_LENGTH = 900;
const FOLDER_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const BUCKET_LABELS: Record<MinioBucketName, string> = {
  [MINIO_BUCKET_IMPORT_INLINE]: 'Import inline assets',
  [MINIO_BUCKET_CARD_ATTACHMENTS]: 'Card attachments',
  [MINIO_BUCKET_BRANDING]: 'Branding images',
  [MINIO_BUCKET_FONTS]: 'Custom fonts',
  [MINIO_BUCKET_USER_AVATARS]: 'User avatars',
  [MINIO_BUCKET_BACKGROUNDS]: 'Board backgrounds',
};

export function getMinioBucketLabel(name: MinioBucketName): string {
  return BUCKET_LABELS[name];
}

export function assertAllowedBucket(bucket: string): MinioBucketName {
  const trimmed = bucket.trim();
  if (!MINIO_BUCKET_NAMES.includes(trimmed as MinioBucketName)) {
    throw new ValidationError('Invalid storage bucket');
  }
  return trimmed as MinioBucketName;
}

export function normalizeStoragePrefix(prefix: string | undefined): string {
  const trimmed = (prefix ?? '').trim().replace(/^\/+/, '');
  if (trimmed.length > MAX_PREFIX_LENGTH) {
    throw new ValidationError('Prefix is too long');
  }
  if (trimmed.includes('..') || trimmed.includes('\\')) {
    throw new ValidationError('Invalid prefix');
  }
  if (trimmed === '') {
    return '';
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function assertSafeObjectKey(key: string, options?: { allowFolderMarker?: boolean }): string {
  const trimmed = key.trim().replace(/^\/+/, '');
  if (trimmed === '' || trimmed.length > MAX_OBJECT_KEY_LENGTH) {
    throw new ValidationError('Invalid object key');
  }
  if (trimmed.includes('..') || trimmed.includes('\\')) {
    throw new ValidationError('Invalid object key');
  }
  const allowFolderMarker = options?.allowFolderMarker === true;
  if (!allowFolderMarker && trimmed.endsWith('/')) {
    throw new ValidationError('Invalid object key');
  }
  return trimmed;
}

export function assertFolderSegmentName(name: string): string {
  const trimmed = name.trim();
  if (!FOLDER_SEGMENT_PATTERN.test(trimmed)) {
    throw new ValidationError(
      'Folder name must start with a letter or digit and contain only letters, digits, dots, dashes, or underscores',
    );
  }
  return trimmed;
}

export function buildObjectKey(prefix: string, segment: string): string {
  const normalizedPrefix = normalizeStoragePrefix(prefix);
  const safeSegment = assertSafeObjectKey(segment);
  return normalizedPrefix === '' ? safeSegment : `${normalizedPrefix}${safeSegment}`;
}

export function buildFolderMarkerKey(prefix: string, folderName: string): string {
  const normalizedPrefix = normalizeStoragePrefix(prefix);
  const segment = assertFolderSegmentName(folderName);
  return `${normalizedPrefix}${segment}/`;
}

export function sanitizeUploadFileName(fileName: string): string {
  const base = fileName.trim().replace(/\\/g, '/').split('/').pop() ?? '';
  if (base === '' || base === '.' || base === '..') {
    throw new ValidationError('Invalid file name');
  }
  if (base.length > 240) {
    throw new ValidationError('File name is too long');
  }
  if (/[\0\r\n"<>|]/.test(base)) {
    throw new ValidationError('File name contains invalid characters');
  }
  return base;
}
