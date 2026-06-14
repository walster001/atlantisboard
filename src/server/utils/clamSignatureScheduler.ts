import { logger } from './logger.js';
import { invalidateClamDbPageCacheWarmState, warmClamDbPageCache } from './clamDbPageCache.js';
import { reloadClamdSignaturesIfActive } from './clamdReload.js';
import { resolveUseClamd } from './clamScanMode.js';
import { getSignatureRefreshIntervalMs } from './clamSignatureConfig.js';
import {
  shouldRunFreshclam,
  shouldSkipMalwareScan,
  updateClamSignaturesIfNeeded,
} from './clamSignatures.js';

export { getSignatureRefreshIntervalMs } from './clamSignatureConfig.js';

export function isSignatureRefreshSchedulerEnabled(): boolean {
  return process.env.POMPELMI_SIGNATURE_REFRESH !== 'false';
}

let schedulerIntervalId: ReturnType<typeof setInterval> | null = null;

export async function runScheduledClamSignatureRefresh(): Promise<void> {
  if (shouldSkipMalwareScan()) {
    return;
  }

  if (!(await shouldRunFreshclam())) {
    logger.info('Skipping scheduled ClamAV signature refresh; signatures are still fresh');
    return;
  }

  logger.info('Starting scheduled ClamAV signature refresh');
  invalidateClamDbPageCacheWarmState();
  await updateClamSignaturesIfNeeded();
  await reloadClamdSignaturesIfActive();
  if (!(await resolveUseClamd())) {
    await warmClamDbPageCache({ force: true });
  }
  logger.info('Scheduled ClamAV signature refresh completed');
}

export function startClamSignatureRefreshScheduler(): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  if (!isSignatureRefreshSchedulerEnabled() || shouldSkipMalwareScan()) {
    return;
  }
  if (schedulerIntervalId !== null) {
    logger.warn('ClamAV signature refresh scheduler already running; skipping duplicate start');
    return;
  }

  const intervalMs = getSignatureRefreshIntervalMs();
  schedulerIntervalId = setInterval(() => {
    void runScheduledClamSignatureRefresh().catch((error: unknown) => {
      logger.warn({ error }, 'Scheduled ClamAV signature refresh failed');
    });
  }, intervalMs);

  logger.info({ intervalMs }, 'ClamAV signature refresh scheduler started');
}

export function stopClamSignatureRefreshScheduler(): void {
  if (schedulerIntervalId !== null) {
    clearInterval(schedulerIntervalId);
    schedulerIntervalId = null;
    logger.info('ClamAV signature refresh scheduler stopped');
  }
}

export function stopClamSignatureRefreshSchedulerForTests(): void {
  stopClamSignatureRefreshScheduler();
}
