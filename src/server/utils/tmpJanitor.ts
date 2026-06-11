import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { logger } from './logger.js';

const ATLBOARD_TMP_PREFIX = 'atlboard-';
const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getMaxAgeMs(): number {
  return parsePositiveInt(process.env.ATLBOARD_TMP_JANITOR_MAX_AGE_MS, DEFAULT_MAX_AGE_MS);
}

/** Remove orphaned `atlboard-*` files/dirs under `/tmp` older than the configured age. */
export async function cleanupStaleAtlboardTempFiles(options?: {
  readonly root?: string;
}): Promise<void> {
  const root = options?.root ?? tmpdir();
  const maxAgeMs = getMaxAgeMs();
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;

  let entries: readonly string[];
  try {
    entries = await readdir(root);
  } catch (error) {
    logger.warn({ error, root }, 'tmp janitor: could not read temp directory');
    return;
  }

  for (const name of entries) {
    if (!name.startsWith(ATLBOARD_TMP_PREFIX)) {
      continue;
    }
    const path = join(root, name);
    try {
      const st = await stat(path);
      if (st.mtimeMs >= cutoff) {
        continue;
      }
      await rm(path, { recursive: true, force: true });
      removed += 1;
    } catch (error) {
      logger.warn({ error, path }, 'tmp janitor: failed to remove stale path');
    }
  }

  if (removed > 0) {
    logger.info({ removed, root, maxAgeMs }, 'tmp janitor removed stale atlboard temp paths');
  }
}
