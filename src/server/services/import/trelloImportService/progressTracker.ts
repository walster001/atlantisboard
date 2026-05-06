import mongoose from 'mongoose';
import { ImportJob } from '../../../models/ImportJob.js';
import { emitToUser } from '../../../utils/socketIO.js';

interface ProgressTrackerParams {
  readonly userId: string;
  readonly jobId: string;
  readonly totalItems: number;
}

export interface ImportProgressTracker {
  readonly markProcessed: (delta: number) => Promise<void>;
  readonly markPhase: (phase: string) => Promise<void>;
}

export async function createImportProgressTracker({
  userId,
  jobId,
  totalItems,
}: ProgressTrackerParams): Promise<ImportProgressTracker> {
  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    throw new Error('Invalid import job id');
  }
  const jobObjectId = new mongoose.Types.ObjectId(jobId);
  let processed = 0;
  let lastEmittedProgress = -1;

  const push = async (phase: string): Promise<void> => {
    const progress = totalItems > 0 ? Math.min(100, Math.round((processed / totalItems) * 100)) : 0;
    await ImportJob.findByIdAndUpdate(jobObjectId, {
      progress,
      processedItems: processed,
      currentPhase: phase,
    });
    if (processed - lastEmittedProgress >= 8 || progress >= 100) {
      emitToUser(userId, 'import:progress', {
        jobId,
        progress,
        itemsProcessed: processed,
        totalItems,
        phase,
      });
      lastEmittedProgress = processed;
    }
  };

  await ImportJob.findByIdAndUpdate(jobObjectId, { totalItems, currentPhase: 'boards' });

  return {
    markProcessed: async (delta: number) => {
      processed += delta;
    },
    markPhase: async (phase: string) => {
      await push(phase);
    },
  };
}
