import { access, readdir, rm, stat } from 'node:fs/promises';
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
import { getSignatureRefreshIntervalMs } from './clamSignatureConfig.js';
import { logger } from './logger.js';

export const CLAMAV_SIGNATURE_FILES = ['main.cvd', 'main.cld', 'daily.cvd', 'daily.cld'] as const;
const SIGNATURE_FILES = CLAMAV_SIGNATURE_FILES;
const FRESHCLAM_DAT = 'freshclam.dat';
const DB_BASE_NAMES = ['main', 'daily', 'bytecode'] as const;

let updateInFlight: Promise<void> | null = null;

export function shouldSkipMalwareScan(): boolean {
  return process.env.POMPELMI_SKIP_SCAN === 'true';
}

export function getFreshclamMinIntervalMs(): number {
  return getSignatureRefreshIntervalMs();
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

export async function getFreshclamDatAgeMs(dbDir: string): Promise<number | null> {
  try {
    const st = await stat(join(dbDir, FRESHCLAM_DAT));
    return Math.max(0, Date.now() - st.mtimeMs);
  } catch {
    return null;
  }
}

/** True when `freshclam` should run (missing DB, stale `freshclam.dat`, or `force`). */
export async function shouldRunFreshclam(options?: { readonly force?: boolean }): Promise<boolean> {
  if (options?.force === true) {
    return true;
  }
  if (shouldSkipMalwareScan()) {
    return false;
  }

  const dbDir = getClamAvDbDir();
  const hasSigs = await hasClamSignatureDatabaseInDir(dbDir);
  if (!hasSigs) {
    return true;
  }

  const ageMs = await getFreshclamDatAgeMs(dbDir);
  if (ageMs === null) {
    return false;
  }

  return ageMs >= getFreshclamMinIntervalMs();
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Remove stale incremental/temp files after a successful `freshclam` run. */
export async function cleanupClamAvDbDir(dbDir: string): Promise<void> {
  let entries: readonly string[];
  try {
    entries = await readdir(dbDir);
  } catch (error) {
    logger.warn({ error, dbDir }, 'ClamAV DB cleanup: could not read directory');
    return;
  }

  for (const name of entries) {
    if (name.endsWith('.cud')) {
      await rm(join(dbDir, name), { force: true });
      continue;
    }
    if (
      name.endsWith('.tmp') ||
      name.endsWith('.part') ||
      name.endsWith('.lock') ||
      name.endsWith('~')
    ) {
      await rm(join(dbDir, name), { force: true });
    }
  }

  for (const base of DB_BASE_NAMES) {
    const cvdPath = join(dbDir, `${base}.cvd`);
    const cldPath = join(dbDir, `${base}.cld`);
    const hasCvd = await fileExists(cvdPath);
    const hasCld = await fileExists(cldPath);
    if (hasCvd && hasCld) {
      await rm(cldPath, { force: true });
    }
  }
}

async function runFreshclam(): Promise<boolean> {
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
      return false;
    }
    return true;
  } catch (error) {
    logger.warn({ error, stderr: stderr.trim() }, 'freshclam could not run');
    return false;
  }
}

/** Download or refresh ClamAV signature files (on-demand / pre-warm). */
export async function updateClamSignaturesIfNeeded(options?: {
  readonly force?: boolean;
}): Promise<void> {
  if (shouldSkipMalwareScan()) {
    return;
  }
  if (updateInFlight !== null) {
    await updateInFlight;
    return;
  }
  updateInFlight = (async () => {
    invalidateClamDbPageCacheWarmState();
    const runUpdate = await shouldRunFreshclam(options);
    if (!runUpdate) {
      logger.debug('Skipping freshclam; ClamAV signatures were updated recently');
      return;
    }
    const succeeded = await runFreshclam();
    if (succeeded) {
      await cleanupClamAvDbDir(getClamAvDbDir());
    }
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
