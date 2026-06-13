import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { executeBackupJobById } from '../services/backupService/backupJobWorker.js';
import { activeJobControllers } from '../services/backupService/backupShared.js';
import { logger } from '../utils/logger.js';

function abortActiveBackupOnSignal(signal: NodeJS.Signals): void {
  for (const controller of activeJobControllers.values()) {
    controller.abort();
  }
  logger.info({ signal }, 'Backup job runner received shutdown signal');
}

process.on('SIGTERM', () => {
  abortActiveBackupOnSignal('SIGTERM');
});

process.on('SIGINT', () => {
  abortActiveBackupOnSignal('SIGINT');
});

async function main(): Promise<void> {
  const jobId = process.argv[2]?.trim();
  const userId = process.argv[3]?.trim();
  const ipRaw = process.argv[4]?.trim();
  const ipAddress = ipRaw != null && ipRaw !== '' ? ipRaw : undefined;

  if (jobId == null || jobId === '' || userId == null || userId === '') {
    console.error('Usage: backupJobRunner <jobId> <userId> [ipAddress]');
    process.exit(2);
  }

  try {
    await connectDatabase();
    const exitCode = await executeBackupJobById({ jobId, userId, ipAddress });
    process.exit(exitCode);
  } catch (error) {
    logger.error({ error, jobId }, 'Backup job runner crashed');
    process.exit(1);
  } finally {
    await disconnectDatabase().catch(() => undefined);
  }
}

void main();
