import { readFile } from 'node:fs/promises';
import { logger } from './logger.js';
import { resolveUseClamd } from './clamScanMode.js';

const DEFAULT_CLAMD_PID_FILE = '/tmp/clamd.pid';

function getClamdPidFile(): string {
  const configured = process.env.POMPELMI_CLAMD_PID_FILE?.trim();
  return configured != null && configured !== '' ? configured : DEFAULT_CLAMD_PID_FILE;
}

/** Ask a running clamd to reload signatures after freshclam (SIGUSR2). No-op when not using clamd. */
export async function reloadClamdSignaturesIfActive(): Promise<void> {
  if (!(await resolveUseClamd())) {
    return;
  }

  const pidFile = getClamdPidFile();
  try {
    const raw = (await readFile(pidFile, 'utf8')).trim();
    const pid = Number.parseInt(raw, 10);
    if (!Number.isFinite(pid) || pid <= 0) {
      logger.warn({ pidFile, raw }, 'clamd pid file invalid; skip reload');
      return;
    }
    process.kill(pid, 'SIGUSR2');
    logger.info({ pid }, 'Signaled clamd to reload signatures');
  } catch (error) {
    logger.warn({ error, pidFile }, 'Could not reload clamd after signature update');
  }
}
