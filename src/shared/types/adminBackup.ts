import type { AdminBackupScope } from '../constants/backupScope.js';
import type { MinioBucketName } from '../constants/minioBuckets.js';

export type AdminBackupSource = 'manual' | 'scheduled' | 'imported';

export type AdminBackupEntryKind = 'backup' | 'schedule';

export interface AdminBackupListItem {
  readonly folderId: string;
  readonly filePath: string;
  readonly sizeBytes: number;
  readonly lastModified: string;
  readonly status?: 'completed' | 'processing' | 'pending' | 'failed' | 'cancelled';
  readonly progress?: number;
  readonly jobId?: string;
  readonly backupSource?: AdminBackupSource;
  readonly entryKind?: AdminBackupEntryKind;
  readonly scheduleLabel?: string;
  readonly scheduleIntervalAmount?: number;
  readonly scheduleIntervalUnit?: 'hours' | 'days' | 'weeks' | 'months';
  readonly backupScope?: AdminBackupScope;
  readonly minioPrefixes?: readonly MinioBucketName[];
}
