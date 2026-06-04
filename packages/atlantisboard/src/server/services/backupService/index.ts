import { getAdminConfig } from '../adminService.js';
import { getResolvedBackupLocationFromEnv } from '../backupLocationEnv.js';
import {
  deleteBackupFolderCatalog,
  ensureBackupPathInCatalog,
  listBackupsCatalog,
} from './backupCatalog.js';
import { executeFullBackupWithProgressImpl } from './backupExecutor.js';
import { cancelBackupJobImpl, startBackupJobImpl, startRestoreJobImpl } from './jobService.js';
import { restoreFullBackupImpl } from './restoreExecutor.js';
import type {
  BackupListEntry as InternalBackupListEntry,
  BackupProgressReporter as InternalBackupProgressReporter,
} from './backupShared.js';

export interface BackupListEntry extends InternalBackupListEntry {}
export interface BackupProgressReporter extends InternalBackupProgressReporter {}

export async function listBackups(): Promise<BackupListEntry[]> {
  return await listBackupsCatalog();
}

export async function deleteBackupFolder(folderId: string): Promise<void> {
  await deleteBackupFolderCatalog(folderId);
}

/**
 * Runs the full backup on the server with progress callbacks (used by {@link startBackupJob}).
 */
export async function executeFullBackupWithProgress(params: {
  readonly adminUserId: string;
  readonly ipAddress?: string | undefined;
  readonly filename: string;
  readonly location: string;
  readonly signal: AbortSignal;
  readonly onProgress: BackupProgressReporter;
}): Promise<{ folderId: string; filePath: string; sizeBytes: number; prunedCount: number }> {
  return await executeFullBackupWithProgressImpl(params);
}

/**
 * Persists a backup job and runs the backup asynchronously on the server (client polls job status).
 * If this user already has a pending or processing job, returns that job id without starting another.
 */
export async function startBackupJob(params: {
  readonly userId: string;
  readonly ipAddress?: string | undefined;
  readonly filename: string;
}): Promise<{ jobId: string; reusedExisting: boolean }> {
  return await startBackupJobImpl(params);
}

export async function cancelBackupJob(jobId: string, userId: string): Promise<boolean> {
  return await cancelBackupJobImpl(jobId, userId);
}

export async function ensureBackupPath(locationInput: string): Promise<string> {
  return await ensureBackupPathInCatalog(locationInput);
}

export async function restoreFullBackup(params: {
  readonly folderId: string;
  readonly adminUserId: string;
  readonly ipAddress?: string | undefined;
  readonly signal?: AbortSignal;
  readonly onProgress?: BackupProgressReporter;
}): Promise<void> {
  await restoreFullBackupImpl(params);
}

export async function startRestoreJob(params: {
  readonly userId: string;
  readonly ipAddress?: string | undefined;
  readonly folderId: string;
}): Promise<{ jobId: string; reusedExisting: boolean }> {
  return await startRestoreJobImpl(params);
}

export async function runScheduledBackupIfDue(): Promise<void> {
  const cfg = await getAdminConfig();
  const settings = cfg.backupSettings;
  const envLocation = getResolvedBackupLocationFromEnv();
  if (!settings?.scheduleEnabled || settings.scheduleFrequencyDays == null || envLocation == null) {
    return;
  }
  const last = settings.lastScheduledRunAt?.getTime() ?? 0;
  const dueAfterMs = settings.scheduleFrequencyDays * 24 * 60 * 60 * 1000;
  if (Date.now() - last < dueAfterMs) {
    return;
  }
  const userId = String(cfg.updatedBy);
  const { reusedExisting } = await startBackupJob({
    userId,
    filename: `scheduled-backup-${new Date().toISOString().slice(0, 10)}.zip`,
  });
  if (!reusedExisting) {
    if (cfg.backupSettings) {
      cfg.backupSettings.lastScheduledRunAt = new Date();
      cfg.markModified('backupSettings');
      await cfg.save();
    }
  }
}
