import { connectDatabase } from '../config/database.js';
import { checkMongoDbDiskReserveAtStartup } from '../utils/diskSpaceGuard.js';
import { logger } from '../utils/logger.js';

/**
 * Separate worker process for background jobs
 * This should be run as a separate process from the main server
 * Usage: bun run src/server/workers/index.ts
 */
async function startWorker(): Promise<void> {
  logger.info('Starting background worker process');

  // Connect to database
  try {
    await connectDatabase();
    await checkMongoDbDiskReserveAtStartup();
    const { dropLegacyUnusedCollections } = await import('../services/startupMigrations.js');
    const { initializeBoardThemes } = await import('../services/boardThemeService.js');
    await dropLegacyUnusedCollections();
    await initializeBoardThemes();
    logger.info('Database connected for worker process');
  } catch (error) {
    logger.error({ error }, 'Failed to connect to database in worker process');
    process.exit(1);
  }

  // Schedule all cron jobs
  scheduleWorkerJobs();

  // Keep process alive
  process.on('SIGTERM', () => {
    logger.info('Worker process received SIGTERM, shutting down gracefully');
    cleanup();
  });

  process.on('SIGINT', () => {
    logger.info('Worker process received SIGINT, shutting down gracefully');
    cleanup();
  });

  async function cleanup(): Promise<void> {
    const { cleanupCronJobs } = await import('./cronJobs.js');
    cleanupCronJobs();
    process.exit(0);
  }

  logger.info('Background worker process started');
}

function scheduleWorkerJobs(): void {
  // Use the centralized cron job scheduler
  import('./cronJobs.js').then(({ scheduleCronJobs }) => {
    scheduleCronJobs();
  });
}

// Start worker if this file is run directly
if (import.meta.main) {
  startWorker().catch((error) => {
    logger.error({ error }, 'Failed to start worker process');
    process.exit(1);
  });
}

export { startWorker };

