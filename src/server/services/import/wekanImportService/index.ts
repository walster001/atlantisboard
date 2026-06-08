import { ImportJob } from '../../../models/ImportJob.js';
import { logger } from '../../../utils/logger.js';
import { emitToUser } from '../../../utils/socketIO.js';
import type { ImportPreflightPayloadParsed } from '../../../../shared/import/importPreflightSchema.js';
import { validateImportPreflightRoleKeys } from '../validateImportRoleKeys.js';
import { executeWekanImportJob } from './execution.js';

export async function importWekan(
  jsonData: unknown,
  userId: string,
  defaultUncolouredCardColour?: string,
  preflight?: ImportPreflightPayloadParsed,
): Promise<string> {
  await validateImportPreflightRoleKeys(preflight);
  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const importJob = new ImportJob({
    userId,
    type: 'wekan',
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
    await executeWekanImportJob({
      jsonData,
      userId,
      jobId,
      ...(defaultUncolouredCardColour !== undefined ? { defaultUncolouredCardColour } : {}),
      ...(preflight !== undefined ? { preflight } : {}),
    });
    return jobId;
  } catch (error) {
    logger.error({ error, jobId }, 'Wekan import failed');
    await ImportJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      importErrors: [{ message: error instanceof Error ? error.message : 'Unknown error' }],
    });
    emitToUser(userId, 'import:error', {
      jobId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
