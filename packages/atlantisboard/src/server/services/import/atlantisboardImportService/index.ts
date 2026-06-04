import { ImportJob } from '../../../models/ImportJob.js';
import { logger } from '../../../utils/logger.js';
import { emitToUser } from '../../../utils/socketIO.js';
import { executeAtlantisboardImportJob } from './execution.js';

export async function importAtlantisboard(
  jsonData: unknown,
  userId: string,
  targetWorkspaceId?: string,
): Promise<string> {
  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const importJob = new ImportJob({
    userId,
    type: 'atlantisboard',
    status: 'processing',
    progress: 0,
    totalItems: 0,
    processedItems: 0,
    importErrors: [],
    expiresAt,
  });

  await importJob.save();
  const jobId = importJob._id.toString();

  try {
    await executeAtlantisboardImportJob({
      jsonData,
      userId,
      jobId,
      ...(targetWorkspaceId !== undefined ? { targetWorkspaceId } : {}),
    });
    return jobId;
  } catch (error) {
    logger.error({ error, jobId }, 'Atlantisboard import failed');
    await ImportJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      importErrors: [{ item: 'import', error: error instanceof Error ? error.message : 'Unknown error' }],
    });
    emitToUser(userId, 'import:error', {
      jobId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
