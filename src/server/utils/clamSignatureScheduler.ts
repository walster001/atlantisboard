import { logger } from './logger.js';
import { invalidateClamDbPageCacheWarmState, warmClamDbPageCache } from './clamDbPageCache.js';
import { reloadClamdSignaturesIfActive } from './clamdReload.js';
import { resolveUseClamd } from './clamScanMode.js';
import { shouldSkipMalwareScan, updateClamSignaturesIfNeeded } from './clamSignatures.js';

const DEFAULT_REFRESH_MS = 86_400_000;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getSignatureRefreshIntervalMs(): number {
  return parsePositiveInt(process.env.POMPELMI_SIGNATURE_REFRESH_MS, DEFAULT_REFRESH_MS);
}

export function isSignatureRefreshSchedulerEnabled(): boolean {
  return process.env.POMPELMI_SIGNATURE_REFRESH !== 'false';
}

let schedulerIntervalId: ReturnType<typeof setInterval> | null = null;

export async function runScheduledClamSignatureRefresh(): Promise<void> {
  if (shouldSkipMalwareScan()) {
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

export function stopClamSignatureRefreshSchedulerForTests(): void {
  if (schedulerIntervalId !== null) {
    clearInterval(schedulerIntervalId);
    schedulerIntervalId = null;
  }
}
