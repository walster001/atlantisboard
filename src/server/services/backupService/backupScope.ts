import {
  ADMIN_BACKUP_SCOPE_VALUES,
  normalizeAdminBackupMinioPrefixes,
  type AdminBackupScope,
} from '../../../shared/constants/backupScope.js';
import { MINIO_BUCKET_NAMES, type MinioBucketName } from '../../../shared/constants/minioBuckets.js';
import type { BackupMinioSelection } from './backupMinioSelection.js';

export type { BackupMinioSelection } from './backupMinioSelection.js';

export function minioPrefixesToSelections(prefixes: readonly MinioBucketName[]): readonly BackupMinioSelection[] {
  return prefixes.map((bucket) => ({ bucket, prefix: '' }));
}

export function normalizeBackupScopeRequest(params: {
  readonly scope: AdminBackupScope;
  readonly minioPrefixes?: readonly string[] | undefined;
}): { readonly scope: AdminBackupScope; readonly minioSelections: readonly BackupMinioSelection[] | null } {
  if (params.scope === 'database') {
    return { scope: 'database', minioSelections: null };
  }
  const prefixes = normalizeAdminBackupMinioPrefixes(params.minioPrefixes);
  return {
    scope: 'database_and_attachments',
    minioSelections: minioPrefixesToSelections(prefixes),
  };
}

/** Legacy jobs without stored scope behave like full database + all buckets. */
export function resolveBackupJobScope(job: {
  readonly backupScope?: AdminBackupScope | undefined;
  readonly minioPrefixes?: readonly string[] | undefined;
}): { readonly scope: AdminBackupScope; readonly minioSelections: readonly BackupMinioSelection[] | null } {
  const scope = job.backupScope ?? 'database_and_attachments';
  if (scope === 'database') {
    return { scope: 'database', minioSelections: null };
  }
  const prefixes = normalizeAdminBackupMinioPrefixes(job.minioPrefixes);
  return {
    scope: 'database_and_attachments',
    minioSelections: minioPrefixesToSelections(prefixes),
  };
}

export function storedMinioPrefixesFromSelections(
  selections: readonly BackupMinioSelection[] | null | undefined,
): readonly MinioBucketName[] | undefined {
  if (selections == null || selections.length === 0) {
    return undefined;
  }
  const allowed = new Set<string>(MINIO_BUCKET_NAMES);
  const out: MinioBucketName[] = [];
  for (const entry of selections) {
    if (allowed.has(entry.bucket) && !out.includes(entry.bucket as MinioBucketName)) {
      out.push(entry.bucket as MinioBucketName);
    }
  }
  return out.length > 0 ? out : undefined;
}

export function isAdminBackupScopeValue(value: string): value is AdminBackupScope {
  return (ADMIN_BACKUP_SCOPE_VALUES as readonly string[]).includes(value);
}
