import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ValidationError } from '../../shared/errors/domainErrors.js';
import {
  getClamAvDbDir,
  invalidateClamDbPageCacheWarmState,
  warmClamDbPageCache,
} from './clamDbPageCache.js';
import { reloadClamdSignaturesIfActive } from './clamdReload.js';
import { resolveUseClamd } from './clamScanMode.js';
import { logger } from './logger.js';

export const CLAMAV_SIGNATURE_FILES = ['main.cvd', 'main.cld', 'daily.cvd', 'daily.cld'] as const;
const SIGNATURE_FILES = CLAMAV_SIGNATURE_FILES;

let updateInFlight: Promise<void> | null = null;

export function shouldSkipMalwareScan(): boolean {
  return process.env.POMPELMI_SKIP_SCAN === 'true';
}

export async function hasClamSignatureDatabaseInDir(dir: string): Promise<boolean> {
  for (const name of SIGNATURE_FILES) {
    try {
      await access(join(dir, name));
      return true;
    } catch {
      // try next candidate
    }
  }
  return false;
}

export async function hasClamSignatureDatabase(): Promise<boolean> {
  return hasClamSignatureDatabaseInDir(getClamAvDbDir());
}

async function runFreshclam(): Promise<void> {
  let stderr = '';
  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn('freshclam', ['--stdout'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });
      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr += String(chunk);
      });
      child.on('error', reject);
      child.on('close', (code) => {
        resolve(code ?? 1);
      });
    });
    if (exitCode !== 0) {
      logger.warn({ exitCode, stderr: stderr.trim() }, 'freshclam exited non-zero');
    }
  } catch (error) {
    logger.warn({ error, stderr: stderr.trim() }, 'freshclam could not run');
  }
}

/** Download or refresh ClamAV signature files (on-demand / pre-warm). */
export async function updateClamSignaturesIfNeeded(): Promise<void> {
  if (shouldSkipMalwareScan()) {
    return;
  }
  if (updateInFlight !== null) {
    await updateInFlight;
    return;
  }
  updateInFlight = (async () => {
    invalidateClamDbPageCacheWarmState();
    await runFreshclam();
    await reloadClamdSignaturesIfActive();
  })().finally(() => {
    updateInFlight = null;
  });
  await updateInFlight;
}

/** Fire-and-forget signature update before the user finishes picking a file. */
export function prewarmMalwareScanner(): void {
  if (shouldSkipMalwareScan()) {
    return;
  }
  void (async () => {
    try {
      if (!(await hasClamSignatureDatabase())) {
        await updateClamSignaturesIfNeeded();
      }
      if (!(await resolveUseClamd())) {
        await warmClamDbPageCache();
      }
    } catch (error) {
      logger.warn({ error }, 'ClamAV pre-warm failed');
    }
  })();
}

/** Ensure signature DB exists before clamscan (first upload or empty volume). */
export async function ensureClamScanReady(): Promise<void> {
  if (shouldSkipMalwareScan()) {
    return;
  }
  if (!(await hasClamSignatureDatabase())) {
    await updateClamSignaturesIfNeeded();
    if (!(await hasClamSignatureDatabase())) {
      throw new ValidationError(
        'Upload blocked: security scan is not ready. Wait a moment and try again.',
      );
    }
  }
  if (!(await resolveUseClamd())) {
    await warmClamDbPageCache();
  }
}
