import { ImportJob } from '../../../models/ImportJob.js';
import { logger } from '../../../utils/logger.js';
import { emitToUser } from '../../../utils/socketIO.js';
import type { ImportPreflightPayloadParsed } from '../../../../shared/import/importPreflightSchema.js';
import { validateImportPreflightRoleKeys } from '../validateImportRoleKeys.js';
import { executeTrelloImportJob } from './execution.js';

export async function importTrello(
  jsonData: unknown,
  userId: string,
  targetWorkspaceId?: string,
  defaultUncolouredCardColour?: string,
  _preflight?: ImportPreflightPayloadParsed,
): Promise<string> {
  await validateImportPreflightRoleKeys(_preflight);
  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const importJob = new ImportJob({
    userId,
    type: 'trello',
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
    await executeTrelloImportJob({
      jsonData,
      userId,
      jobId,
      ...(targetWorkspaceId !== undefined ? { targetWorkspaceId } : {}),
      ...(defaultUncolouredCardColour !== undefined ? { defaultUncolouredCardColour } : {}),
      ...(_preflight !== undefined ? { preflight: _preflight } : {}),
    });
    return jobId;
  } catch (error) {
    logger.error({ error, jobId }, 'Trello import failed');
    await ImportJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      importErrors: [
        {
          item: 'trello',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      ],
    });

    emitToUser(userId, 'import:error', {
      jobId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
