import mongoose from 'mongoose';
import { requireBackupLocationFromEnv } from '../backupLocationEnv.js';
import { BackupJob } from '../../models/BackupJob.js';
import { logger } from '../../utils/logger.js';
import {
  BACKUP_PHASE_TOTAL,
  RESTORE_PHASE_TOTAL,
  activeJobControllers,
  normalizeFilename,
  normalizeLocationPath,
} from './backupShared.js';
import { purgeMalformedActiveBackupJobs } from './backupCatalog.js';
import { executeFullBackupWithProgressImpl } from './backupExecutor.js';
import { restoreFullBackupImpl } from './restoreExecutor.js';
import {
  NotFoundError,
} from '../../../shared/errors/domainErrors.js';

async function runBackupJobWorker(
  jobId: string,
  adminUserId: string,
  ipAddress: string | undefined,
): Promise<void> {
  const report = async (
    phase: string,
    progress: number,
    processedItems: number,
    totalItems: number,
  ): Promise<void> => {
    await BackupJob.findByIdAndUpdate(jobId, {
      status: 'processing',
      startedAt: new Date(),
      currentPhase: phase,
      progress,
      processedItems,
      totalItems,
    });
  };
  try {
    const job = await BackupJob.findById(jobId).lean();
    if (!job) {
      return;
    }
    const loc = typeof job.location === 'string' ? job.location.trim() : '';
    const fn = typeof job.filename === 'string' ? job.filename.trim() : '';
    if (loc === '' || fn === '') {
      await BackupJob.deleteOne({ _id: jobId });
      logger.warn({ jobId }, 'Removed backup job missing location/filename (cannot run)');
      return;
    }
    const controller = new AbortController();
    activeJobControllers.set(jobId, controller);
    await report('queued', 2, 0, BACKUP_PHASE_TOTAL);
    const result = await executeFullBackupWithProgressImpl({
      adminUserId,
      ipAddress,
      filename: job.filename,
      location: job.location,
      signal: controller.signal,
      onProgress: { report },
    });
    await BackupJob.findByIdAndUpdate(jobId, {
      status: 'completed',
      progress: 100,
      processedItems: BACKUP_PHASE_TOTAL,
      totalItems: BACKUP_PHASE_TOTAL,
      currentPhase: 'done',
      result,
      completedAt: new Date(),
    });
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : String(error);
    if (failureMessage === 'BACKUP_CANCELLED') {
      await BackupJob.findByIdAndUpdate(jobId, {
        status: 'cancelled',
        currentPhase: 'cancelled',
        failureMessage: 'Backup was cancelled.',
        completedAt: new Date(),
      });
      return;
    }
    logger.error({ error, jobId }, 'Backup job failed');
    await BackupJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      currentPhase: 'failed',
      failureMessage,
      progress: 0,
    });
  } finally {
    activeJobControllers.delete(jobId);
  }
}

async function runRestoreJobWorker(
  jobId: string,
  adminUserId: string,
  ipAddress: string | undefined,
  sourceFolderId: string,
): Promise<void> {
  const report = async (
    phase: string,
    progress: number,
    processedItems: number,
    totalItems: number,
  ): Promise<void> => {
    await BackupJob.findByIdAndUpdate(jobId, {
      status: 'processing',
      startedAt: new Date(),
      currentPhase: phase,
      progress,
      processedItems,
      totalItems,
    });
  };
  try {
    const controller = new AbortController();
    activeJobControllers.set(jobId, controller);
    await report('queued', 1, 0, RESTORE_PHASE_TOTAL);
    await restoreFullBackupImpl({
      folderId: sourceFolderId,
      adminUserId,
      ipAddress,
      signal: controller.signal,
      onProgress: { report },
    });
    await BackupJob.findByIdAndUpdate(jobId, {
      status: 'completed',
      progress: 100,
      processedItems: RESTORE_PHASE_TOTAL,
      totalItems: RESTORE_PHASE_TOTAL,
      currentPhase: 'restore_done',
      completedAt: new Date(),
    });
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : String(error);
    if (failureMessage === 'BACKUP_CANCELLED') {
      await BackupJob.findByIdAndUpdate(jobId, {
        status: 'cancelled',
        currentPhase: 'cancelled',
        failureMessage: 'Restore was cancelled.',
        completedAt: new Date(),
      });
      return;
    }
    logger.error({ error, jobId }, 'Restore job failed');
    await BackupJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      currentPhase: 'failed',
      failureMessage,
      progress: 0,
      completedAt: new Date(),
    });
  } finally {
    activeJobControllers.delete(jobId);
  }
}

export async function startBackupJobImpl(params: {
  readonly userId: string;
  readonly ipAddress?: string | undefined;
  readonly filename: string;
}): Promise<{ jobId: string; reusedExisting: boolean }> {
  await purgeMalformedActiveBackupJobs();
  const location = requireBackupLocationFromEnv();
  const userOid = new mongoose.Types.ObjectId(params.userId);
  const existing = await BackupJob.findOne({
    userId: userOid,
    $or: [{ jobKind: 'backup' }, { jobKind: { $exists: false } }],
    status: { $in: ['pending', 'processing'] },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (existing?._id != null) {
    return { jobId: String(existing._id), reusedExisting: true };
  }

  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const doc = await BackupJob.create({
    userId: userOid,
    jobKind: 'backup',
    status: 'pending',
    progress: 0,
    totalItems: BACKUP_PHASE_TOTAL,
    processedItems: 0,
    currentPhase: 'queued',
    filename: normalizeFilename(params.filename),
    location: normalizeLocationPath(location),
    expiresAt,
  });
  const jobId = doc._id.toString();
  void runBackupJobWorker(jobId, params.userId, params.ipAddress).catch((err: unknown) => {
    logger.error({ err, jobId }, 'Backup job worker crashed');
    void BackupJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      currentPhase: 'failed',
      failureMessage: err instanceof Error ? err.message : String(err),
      progress: 0,
    });
  });
  return { jobId, reusedExisting: false };
}

export async function cancelBackupJobImpl(jobId: string, userId: string): Promise<boolean> {
  if (!mongoose.isValidObjectId(jobId)) {
    return false;
  }
  const userOid = new mongoose.Types.ObjectId(userId);
  const updated = await BackupJob.findOneAndUpdate(
    {
      _id: jobId,
      userId: userOid,
      status: { $in: ['pending', 'processing'] },
    },
    {
      $set: {
        cancelRequestedAt: new Date(),
        status: 'cancelled',
        currentPhase: 'cancelled',
        failureMessage: 'Backup was cancelled.',
        completedAt: new Date(),
      },
    },
    { new: false },
  );
  if (updated == null) {
    return false;
  }
  const controller = activeJobControllers.get(jobId);
  if (controller) {
    controller.abort();
  }
  return true;
}

export async function startRestoreJobImpl(params: {
  readonly userId: string;
  readonly ipAddress?: string | undefined;
  readonly folderId: string;
}): Promise<{ jobId: string; reusedExisting: boolean }> {
  const userOid = new mongoose.Types.ObjectId(params.userId);
  const existing = await BackupJob.findOne({
    userId: userOid,
    jobKind: 'restore',
    status: { $in: ['pending', 'processing'] },
  })
    .sort({ createdAt: -1 })
    .lean();
  if (existing?._id != null) {
    return { jobId: String(existing._id), reusedExisting: true };
  }

  const source = await BackupJob.findOne({
    'result.folderId': params.folderId,
    $or: [{ jobKind: 'backup' }, { jobKind: { $exists: false } }],
  })
    .sort({ completedAt: -1 })
    .lean();
  if (source?.result?.filePath == null || source.filename == null || source.location == null) {
    throw new NotFoundError('Backup archive not found');
  }

  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const doc = await BackupJob.create({
    userId: userOid,
    jobKind: 'restore',
    sourceFolderId: params.folderId,
    status: 'pending',
    progress: 0,
    totalItems: RESTORE_PHASE_TOTAL,
    processedItems: 0,
    currentPhase: 'queued',
    filename: source.filename,
    location: source.location,
    expiresAt,
  });
  const jobId = doc._id.toString();
  void runRestoreJobWorker(jobId, params.userId, params.ipAddress, params.folderId).catch((err: unknown) => {
    logger.error({ err, jobId }, 'Restore job worker crashed');
    void BackupJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      currentPhase: 'failed',
      failureMessage: err instanceof Error ? err.message : String(err),
      progress: 0,
      completedAt: new Date(),
    });
  });
  return { jobId, reusedExisting: false };
}
