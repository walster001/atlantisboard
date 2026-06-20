import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { BackupJob } from '../../models/BackupJob.js';
import { logger } from '../../utils/logger.js';
import { isScheduledBackupFolderId } from '../../../shared/utils/backupFolderNaming.js';
import { backupFolderMillis, type BackupListEntry, normalizeLocationPath } from './backupShared.js';
import { formatBackupFolderTimestamp } from '../../../shared/utils/backupFolderNaming.js';

export function buildBackupFilePath(location: string, folderId: string, filename: string): string {
  return join(location, folderId, filename);
}

/**
 * Removes active backup jobs that cannot run under the current schema (missing path/filename),
 * e.g. documents created before those fields existed. Prevents stuck "in progress" rows and
 * validation errors on cancel/save.
 */
export async function purgeMalformedActiveBackupJobs(): Promise<void> {
  const res = await BackupJob.deleteMany({
    status: { $in: ['pending', 'processing'] },
    $or: [
      { filename: { $exists: false } },
      { filename: null },
      { filename: '' },
      { location: { $exists: false } },
      { location: null },
      { location: '' },
    ],
  });
  if (res.deletedCount > 0) {
    logger.warn({ deletedCount: res.deletedCount }, 'Removed malformed in-progress backup job(s)');
  }
}

export async function listBackupsCatalog(): Promise<BackupListEntry[]> {
  await purgeMalformedActiveBackupJobs();
  const jobs = await BackupJob.find({
    $or: [
      { jobKind: 'backup' },
      { jobKind: 'schedule' },
      { jobKind: { $exists: false } },
    ],
    status: { $in: ['completed', 'processing', 'pending', 'failed', 'cancelled'] },
  })
    .sort({ createdAt: -1 })
    .lean();
  return jobs
    .filter((job) => {
      if (job.jobKind === 'schedule') {
        return job.result?.folderId != null;
      }
      return job.result?.folderId != null || job.status === 'processing' || job.status === 'pending';
    })
    .map((job) => {
      if (job.jobKind === 'schedule') {
        const folderId = job.result?.folderId ?? '';
        const unit = job.scheduleIntervalUnit;
        return {
          folderId,
          filePath: '',
          sizeBytes: 0,
          lastModified: job.createdAt.toISOString(),
          status: 'completed' as const,
          jobId: String(job._id),
          backupSource: 'scheduled' as const,
          entryKind: 'schedule' as const,
          scheduleLabel: job.filename,
          ...(typeof job.scheduleIntervalAmount === 'number' ? { scheduleIntervalAmount: job.scheduleIntervalAmount } : {}),
          ...(unit === 'hours' || unit === 'days' || unit === 'weeks' || unit === 'months'
            ? { scheduleIntervalUnit: unit }
            : {}),
        };
      }
      const result = job.result;
      const fallbackFolderId = `${formatBackupFolderTimestamp(job.createdAt)}_pending-${String(job._id)}`;
      const fallbackLocation = typeof job.location === 'string' && job.location.trim() !== '' ? job.location : '/unknown-location';
      const fallbackFilename = typeof job.filename === 'string' && job.filename.trim() !== '' ? job.filename : 'backup.zip';
      const backupSource =
        job.backupSource === 'manual' || job.backupSource === 'scheduled' || job.backupSource === 'imported'
          ? job.backupSource
          : undefined;
      return {
        folderId: result?.folderId ?? fallbackFolderId,
        filePath: result?.filePath ?? buildBackupFilePath(fallbackLocation, fallbackFolderId, fallbackFilename),
        sizeBytes: result?.sizeBytes ?? 0,
        lastModified: (job.completedAt ?? job.updatedAt).toISOString(),
        status: job.status,
        progress: job.progress,
        jobId: String(job._id),
        ...(backupSource != null ? { backupSource } : {}),
      };
    });
}

export async function deleteBackupFolderCatalog(folderId: string): Promise<void> {
  if (isScheduledBackupFolderId(folderId)) {
    await BackupJob.deleteOne({ jobKind: 'schedule', 'result.folderId': folderId });
    return;
  }
  const docs = await BackupJob.find({
    'result.folderId': folderId,
    $or: [{ jobKind: 'backup' }, { jobKind: { $exists: false } }],
  })
    .sort({ completedAt: -1 })
    .lean();
  if (docs.length === 0) {
    return;
  }
  for (const doc of docs) {
    const filePath = doc.result?.filePath;
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      continue;
    }
    await rm(filePath, { force: true });
    await rm(dirname(filePath), { recursive: true, force: true });
  }
  await BackupJob.deleteMany({
    'result.folderId': folderId,
    $or: [{ jobKind: 'backup' }, { jobKind: { $exists: false } }],
  });
}

export async function pruneOldBackups(retentionDays: number): Promise<number> {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return 0;
  }
  const cutoff = Date.now() - retentionDays * 86_400_000;
  const entries = await listBackupsCatalog();
  let removed = 0;
  for (const e of entries) {
    if (e.entryKind === 'schedule') {
      continue;
    }
    const ms = backupFolderMillis(e.folderId);
    if (ms !== null && ms < cutoff) {
      await deleteBackupFolderCatalog(e.folderId);
      removed += 1;
    }
  }
  return removed;
}

export async function ensureBackupPathInCatalog(locationInput: string): Promise<string> {
  const location = normalizeLocationPath(locationInput);
  await mkdir(location, { recursive: true });
  return location;
}
