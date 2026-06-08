import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ValidationError } from '../../shared/errors/domainErrors.js';
import { logger } from './logger.js';

const DB_DIR = process.env.CLAMAV_DB_DIR?.trim() || '/var/lib/clamav';

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
  return hasClamSignatureDatabaseInDir(DB_DIR);
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
  updateInFlight = runFreshclam().finally(() => {
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
  if (await hasClamSignatureDatabase()) {
    return;
  }
  await updateClamSignaturesIfNeeded();
  if (!(await hasClamSignatureDatabase())) {
    throw new ValidationError(
      'Upload blocked: security scan is not ready. Wait a moment and try again.',
    );
  }
}
