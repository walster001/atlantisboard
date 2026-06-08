import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from './logger.js';

const DEFAULT_DB_DIR = '/var/lib/clamav';

export function getClamAvDbDir(): string {
  const configured = process.env.CLAMAV_DB_DIR?.trim();
  return configured != null && configured !== '' ? configured : DEFAULT_DB_DIR;
}

/** Pre-read signature files so the OS page cache serves subsequent clamscan spawns (no extra Node RAM). */
export function isClamDbPageCacheWarmEnabled(): boolean {
  return process.env.POMPELMI_DB_PAGE_CACHE_WARM !== 'false';
}

export async function listClamSignatureFileNames(dbDir: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(dbDir);
    return entries
      .filter((name) => name.endsWith('.cvd') || name.endsWith('.cld'))
      .sort();
  } catch {
    return [];
  }
}

/** Fingerprint from file size + mtime; used to detect freshclam updates and skip redundant reads. */
export async function computeClamSignatureFingerprint(dbDir: string): Promise<string | null> {
  const names = await listClamSignatureFileNames(dbDir);
  if (names.length === 0) {
    return null;
  }

  const parts: string[] = [];
  for (const name of names) {
    try {
      const fileStat = await stat(join(dbDir, name));
      parts.push(`${name}:${fileStat.size}:${Math.floor(fileStat.mtimeMs)}`);
    } catch {
      // File removed between readdir and stat; skip.
    }
  }

  return parts.length > 0 ? parts.join('|') : null;
}

let warmedFingerprint: string | null = null;
let warmInFlight: Promise<void> | null = null;

export function resetClamDbPageCacheStateForTests(): void {
  warmedFingerprint = null;
  warmInFlight = null;
}

export function getWarmedFingerprintForTests(): string | null {
  return warmedFingerprint;
}

async function readFileIntoOsPageCache(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 });
    stream.on('data', () => {
      // Discard buffer; goal is kernel page cache, not Node heap retention.
    });
    stream.on('error', reject);
    stream.on('end', () => {
      resolve();
    });
  });
}

/**
 * Sequentially read ClamAV .cvd/.cld files so later clamscan children load signatures from page cache.
 * Returns true when a full read pass ran; false when skipped (disabled, missing DB, or already warm).
 */
export async function warmClamDbPageCache(options?: {
  readonly dbDir?: string;
  readonly force?: boolean;
}): Promise<boolean> {
  if (!isClamDbPageCacheWarmEnabled()) {
    return false;
  }

  const dbDir = options?.dbDir ?? getClamAvDbDir();
  const fingerprint = await computeClamSignatureFingerprint(dbDir);
  if (fingerprint == null) {
    return false;
  }

  if (!options?.force && warmedFingerprint === fingerprint) {
    return false;
  }

  if (warmInFlight !== null) {
    await warmInFlight;
    if (!options?.force && warmedFingerprint === fingerprint) {
      return false;
    }
  }

  warmInFlight = (async () => {
    const names = await listClamSignatureFileNames(dbDir);
    const startedAt = Date.now();
    for (const name of names) {
      await readFileIntoOsPageCache(join(dbDir, name));
    }
    warmedFingerprint = fingerprint;
    logger.info(
      {
        dbDir,
        fileCount: names.length,
        durationMs: Date.now() - startedAt,
        fingerprint,
      },
      'ClamAV signature database warmed into OS page cache',
    );
  })().finally(() => {
    warmInFlight = null;
  });

  await warmInFlight;
  return true;
}

/** Call after freshclam so the next warm pass re-reads updated signature files. */
export function invalidateClamDbPageCacheWarmState(): void {
  warmedFingerprint = null;
}
