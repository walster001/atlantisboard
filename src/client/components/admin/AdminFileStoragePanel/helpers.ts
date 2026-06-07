import type { MinioBucketName } from '../../../../shared/constants/minioBuckets.js';

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

export type FileStorageBreadcrumb = {
  readonly label: string;
  readonly prefix: string;
};

export function buildPrefixBreadcrumbs(prefix: string): readonly FileStorageBreadcrumb[] {
  const crumbs: FileStorageBreadcrumb[] = [{ label: 'Root', prefix: '' }];
  if (prefix.trim() === '') {
    return crumbs;
  }
  const normalized = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const parts = normalized.split('/').filter((part) => part.length > 0);
  let current = '';
  for (const part of parts) {
    current = `${current}${part}/`;
    crumbs.push({ label: part, prefix: current });
  }
  return crumbs;
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
