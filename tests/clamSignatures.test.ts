import { describe, it, expect, afterEach } from 'bun:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ensureClamScanReady,
  hasClamSignatureDatabaseInDir,
} from '../src/server/utils/clamSignatures.js';
import {
  getWarmedFingerprintForTests,
  resetClamDbPageCacheStateForTests,
} from '../src/server/utils/clamDbPageCache.js';
import { ValidationError } from '../src/shared/errors/domainErrors.js';

describe('clamSignatures', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetClamDbPageCacheStateForTests();
  });

  it('detects signature files in a directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clam-sigs-'));
    try {
      expect(await hasClamSignatureDatabaseInDir(dir)).toBe(false);
      await writeFile(join(dir, 'main.cvd'), 'stub');
      expect(await hasClamSignatureDatabaseInDir(dir)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws ValidationError (not 500) when signatures are unavailable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clam-empty-'));
    try {
      process.env.CLAMAV_DB_DIR = dir;
      process.env.POMPELMI_SKIP_SCAN = 'false';
      await expect(ensureClamScanReady()).rejects.toBeInstanceOf(ValidationError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('warms page cache when signatures are present', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clam-ready-warm-'));
    try {
      process.env.CLAMAV_DB_DIR = dir;
      process.env.POMPELMI_SKIP_SCAN = 'false';
      process.env.POMPELMI_USE_CLAMD = 'false';
      await writeFile(join(dir, 'main.cvd'), 'stub');

      await ensureClamScanReady();

      expect(getWarmedFingerprintForTests()).not.toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('skips readiness check when POMPELMI_SKIP_SCAN is true', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clam-skip-'));
    try {
      process.env.CLAMAV_DB_DIR = dir;
      process.env.POMPELMI_SKIP_SCAN = 'true';
      await expect(ensureClamScanReady()).resolves.toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
