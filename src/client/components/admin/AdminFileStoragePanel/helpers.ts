import type { MinioBucketName } from '../../../../shared/constants/minioBuckets.js';
import type { AdminFileStorageObjectEntry } from '../../../../shared/types/adminFileStorage.js';

export function entryPrimaryLabel(entry: AdminFileStorageObjectEntry): string {
  const friendly = entry.displayName?.trim();
  return friendly != null && friendly !== '' ? friendly : entry.name;
}

export function entryShowsStorageKey(entry: AdminFileStorageObjectEntry): boolean {
  const friendly = entry.displayName?.trim();
  return friendly != null && friendly !== '' && friendly !== entry.name;
}

export function formatFileSize(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) {
    return '—';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatModifiedAt(iso: string | null): string {
  if (iso == null || iso.trim() === '') {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString();
}

export function isLikelyImageEntry(contentType: string | null, name: string): boolean {
  if (contentType != null && contentType.startsWith('image/')) {
    return true;
  }
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(name);
}

/** Parent prefix for MinIO folder navigation (trailing slash). */
export function parentPrefix(prefix: string): string {
  const trimmed = prefix.trim();
  if (trimmed === '') {
    return '';
  }
  const segments = trimmed.replace(/\/$/, '').split('/').filter((part) => part !== '');
  if (segments.length <= 1) {
    return '';
  }
  segments.pop();
  return `${segments.join('/')}/`;
}

export function bucketSelectData(
  buckets: readonly { name: MinioBucketName; label: string; exists: boolean }[],
): { value: string; label: string; disabled?: boolean }[] {
  return buckets.map((bucket) => ({
    value: bucket.name,
    label: bucket.exists ? bucket.label : `${bucket.label} (missing)`,
    disabled: !bucket.exists,
  }));
}
