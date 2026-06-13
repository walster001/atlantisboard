import { BackupJob } from '../../models/BackupJob.js';
import { logger } from '../../utils/logger.js';
import { runBunGarbageCollection } from '../../utils/bunGc.js';
import { BACKUP_PHASE_TOTAL, activeJobControllers } from './backupShared.js';
import { executeFullBackupWithProgressImpl } from './backupExecutor.js';

export async function executeBackupJobById(params: {
  readonly jobId: string;
  readonly userId: string;
  readonly ipAddress?: string | undefined;
}): Promise<number> {
  const { jobId, userId, ipAddress } = params;
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
      return 0;
    }
    const loc = typeof job.location === 'string' ? job.location.trim() : '';
    const fn = typeof job.filename === 'string' ? job.filename.trim() : '';
    if (loc === '' || fn === '') {
      await BackupJob.deleteOne({ _id: jobId });
      logger.warn({ jobId }, 'Removed backup job missing location/filename (cannot run)');
      return 0;
    }
    const controller = new AbortController();
    activeJobControllers.set(jobId, controller);
    await report('queued', 2, 0, BACKUP_PHASE_TOTAL);
    const result = await executeFullBackupWithProgressImpl({
      adminUserId: userId,
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
    return 0;
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : String(error);
    if (failureMessage === 'BACKUP_CANCELLED') {
      await BackupJob.findByIdAndUpdate(jobId, {
        status: 'cancelled',
        currentPhase: 'cancelled',
        failureMessage: 'Backup was cancelled.',
        completedAt: new Date(),
      });
      return 0;
    }
    logger.error({ error, jobId }, 'Backup job failed');
    await BackupJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      currentPhase: 'failed',
      failureMessage,
      progress: 0,
    });
    return 1;
  } finally {
    activeJobControllers.delete(jobId);
    runBunGarbageCollection('backup-job-complete');
  }
}
