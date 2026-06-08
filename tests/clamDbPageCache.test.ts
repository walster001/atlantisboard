import { describe, it, expect, afterEach } from 'bun:test';
import { mkdtemp, writeFile, rm, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  computeClamSignatureFingerprint,
  getWarmedFingerprintForTests,
  isClamDbPageCacheWarmEnabled,
  listClamSignatureFileNames,
  resetClamDbPageCacheStateForTests,
  warmClamDbPageCache,
} from '../src/server/utils/clamDbPageCache.js';

describe('clamDbPageCache', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetClamDbPageCacheStateForTests();
  });

  it('lists only .cvd and .cld signature files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clam-pagecache-list-'));
    try {
      await writeFile(join(dir, 'main.cvd'), 'main');
      await writeFile(join(dir, 'daily.cld'), 'daily');
      await writeFile(join(dir, 'freshclam.dat'), 'meta');
      await writeFile(join(dir, 'readme.txt'), 'ignore');

      expect(await listClamSignatureFileNames(dir)).toEqual(['daily.cld', 'main.cvd']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('builds a fingerprint from size and mtime', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clam-pagecache-fp-'));
    try {
      const mainPath = join(dir, 'main.cvd');
      await writeFile(mainPath, 'signature-bytes');
      const mtime = new Date('2024-06-01T12:00:00.000Z');
      await utimes(mainPath, mtime, mtime);

      const fingerprint = await computeClamSignatureFingerprint(dir);
      expect(fingerprint).toMatch(/^main\.cvd:\d+:1717243200000$/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('changes fingerprint when a signature file is updated', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clam-pagecache-change-'));
    try {
      const mainPath = join(dir, 'main.cvd');
      await writeFile(mainPath, 'v1');
      const before = await computeClamSignatureFingerprint(dir);

      await writeFile(mainPath, 'v2-longer');
      const after = await computeClamSignatureFingerprint(dir);

      expect(before).not.toBe(after);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('warms page cache once per fingerprint and skips redundant reads', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clam-pagecache-warm-'));
    try {
      await writeFile(join(dir, 'main.cvd'), 'warm-me');

      const first = await warmClamDbPageCache({ dbDir: dir });
      const second = await warmClamDbPageCache({ dbDir: dir });

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(getWarmedFingerprintForTests()).toBe(await computeClamSignatureFingerprint(dir));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('re-warms when force=true even if fingerprint is unchanged', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clam-pagecache-force-'));
    try {
      await writeFile(join(dir, 'daily.cvd'), 'daily');

      expect(await warmClamDbPageCache({ dbDir: dir })).toBe(true);
      expect(await warmClamDbPageCache({ dbDir: dir, force: true })).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('can be disabled with POMPELMI_DB_PAGE_CACHE_WARM=false', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clam-pagecache-off-'));
    try {
      process.env.POMPELMI_DB_PAGE_CACHE_WARM = 'false';
      await writeFile(join(dir, 'main.cvd'), 'skip');

      expect(isClamDbPageCacheWarmEnabled()).toBe(false);
      expect(await warmClamDbPageCache({ dbDir: dir })).toBe(false);
      expect(getWarmedFingerprintForTests()).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
