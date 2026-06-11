import { describe, it, expect, afterEach } from 'bun:test';
import { mkdtemp, writeFile, rm, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  cleanupClamAvDbDir,
  ensureClamScanReady,
  getFreshclamDatAgeMs,
  hasClamSignatureDatabaseInDir,
  shouldRunFreshclam,
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

  it('reports freshclam.dat age in milliseconds', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clam-dat-age-'));
    try {
      const datPath = join(dir, 'freshclam.dat');
      await writeFile(datPath, 'meta');
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await utimes(datPath, twoHoursAgo, twoHoursAgo);
      const ageMs = await getFreshclamDatAgeMs(dir);
      expect(ageMs).not.toBeNull();
      expect(ageMs!).toBeGreaterThanOrEqual(2 * 60 * 60 * 1000 - 1000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('skips freshclam when signatures and freshclam.dat are recent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clam-fresh-'));
    try {
      process.env.CLAMAV_DB_DIR = dir;
      process.env.POMPELMI_SIGNATURE_REFRESH_MS = '86400000';
      await writeFile(join(dir, 'main.cvd'), 'stub');
      await writeFile(join(dir, 'freshclam.dat'), 'meta');
      expect(await shouldRunFreshclam()).toBe(false);
      expect(await shouldRunFreshclam({ force: true })).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('requests freshclam when signatures are missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clam-missing-'));
    try {
      process.env.CLAMAV_DB_DIR = dir;
      process.env.POMPELMI_SKIP_SCAN = 'false';
      expect(await shouldRunFreshclam()).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('removes stale incremental and redundant signature files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clam-cleanup-'));
    try {
      await writeFile(join(dir, 'main.cvd'), 'full');
      await writeFile(join(dir, 'main.cld'), 'incr');
      await writeFile(join(dir, 'daily.cud'), 'delta');
      await writeFile(join(dir, 'freshclam.dat'), 'meta');
      await cleanupClamAvDbDir(dir);
      expect(await hasClamSignatureDatabaseInDir(dir)).toBe(true);
      const { access } = await import('node:fs/promises');
      await expect(access(join(dir, 'main.cld'))).rejects.toThrow();
      await expect(access(join(dir, 'daily.cud'))).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
