import { basename, isAbsolute, normalize, resolve } from 'node:path';
import {
  parseBackupFolderMillis,
  newBackupFolderId as createBackupFolderId,
} from '../../../shared/utils/backupFolderNaming.js';

/** Current archive manifest format (BSON mongo + mc mirror/sdk minio). */
export const BACKUP_FORMAT = 'atlboard-backup-v2' as const;
export const BACKUP_FORMAT_V1 = 'atlboard-backup-v1' as const;

export const MONGO_RESTORE_ORDER: readonly string[] = [
  'roledefinitions',
  'permissionsets',
  'users',
  'themes',
  'adminconfigs',
  'backupjobs',
  'workspaces',
  'boards',
  'boardlabels',
  'lists',
  'cards',
  'activities',
  'sessions',
  'invitelinks',
  'importjobs',
  'notifications',
];

/** Collections omitted from portable dumps (transient server state). */
export const MONGO_BACKUP_EXCLUDE = new Set<string>(['backupjobs']);

export const BACKUP_PHASE_TOTAL = 5;
export const RESTORE_PHASE_TOTAL = 4;

export type BackupSource = 'manual' | 'scheduled' | 'imported';

export type BackupEntryKind = 'backup' | 'schedule';

export interface BackupListEntry {
  readonly folderId: string;
  readonly filePath: string;
  readonly sizeBytes: number;
  readonly lastModified: string;
  readonly status: 'completed' | 'processing' | 'pending' | 'failed' | 'cancelled';
  readonly progress?: number;
  readonly jobId?: string;
  readonly backupSource?: BackupSource;
  readonly entryKind?: BackupEntryKind;
  readonly scheduleLabel?: string;
  readonly scheduleIntervalAmount?: number;
  readonly scheduleIntervalUnit?: 'hours' | 'days' | 'weeks' | 'months';
}

export interface BackupProgressReporter {
  readonly report: (
    phase: string,
    progress: number,
    processedItems: number,
    totalItems: number,
  ) => Promise<void>;
}

export interface ParsedBackupManifest {
  readonly format: typeof BACKUP_FORMAT | typeof BACKUP_FORMAT_V1;
  readonly mongoCollections: readonly string[];
  readonly minioArchiveMethod: import('./minioIo.js').MinioArchiveMethod;
  readonly minioMetadataFile?: string;
}

export const activeJobControllers = new Map<string, AbortController>();

export function sortCollectionsForRestore(names: readonly string[]): string[] {
  const set = new Set(names);
  const ordered: string[] = [];
  for (const n of MONGO_RESTORE_ORDER) {
    if (set.has(n)) {
      ordered.push(n);
    }
  }
  const rest = [...set].filter((n) => !ordered.includes(n)).sort((a, b) => a.localeCompare(b));
  return [...ordered, ...rest];
}

export function newBackupFolderId(existingFolderIds?: ReadonlySet<string>): string {
  return createBackupFolderId(existingFolderIds);
}

export function backupFolderMillis(folderId: string): number | null {
  return parseBackupFolderMillis(folderId);
}

export function normalizeFilename(input: string): string {
  const trimmed = input.trim();
  const base = basename(trimmed);
  const safe = base.replace(/[^0-9A-Za-z._-]/g, '_');
  const withExt = safe.toLowerCase().endsWith('.zip') ? safe : `${safe}.zip`;
  if (withExt === '.zip' || withExt === '') {
    throw new Error('Filename is invalid');
  }
  return withExt;
}

export function normalizeLocationPath(input: string): string {
  const trimmed = input.trim().replace(/\\/g, '/');
  if (!isAbsolute(trimmed)) {
    throw new Error('Location must be an absolute local filesystem path');
  }
  return normalize(resolve(trimmed));
}

export function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error('BACKUP_CANCELLED');
  }
}

export function progressRange(start: number, end: number, completed: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) {
    return Math.floor(start);
  }
  const ratio = Math.max(0, Math.min(1, completed / total));
  return Math.floor(start + (end - start) * ratio);
}
