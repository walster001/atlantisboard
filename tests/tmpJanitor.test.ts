import { describe, it, expect, afterEach } from 'bun:test';
import { mkdir, mkdtemp, writeFile, rm, utimes, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cleanupStaleAtlboardTempFiles } from '../src/server/utils/tmpJanitor.js';

describe('tmpJanitor', () => {
  const originalEnv = { ...process.env };
  let root = '';

  afterEach(async () => {
    process.env = { ...originalEnv };
    if (root !== '') {
      await rm(root, { recursive: true, force: true });
      root = '';
    }
  });

  it('removes atlboard-* paths older than the configured age', async () => {
    root = await mkdtemp(join(tmpdir(), 'janitor-root-'));
    const staleDir = join(root, 'atlboard-stale-dir');
    const freshFile = join(root, 'atlboard-fresh-file');
    await mkdir(staleDir);
    await writeFile(join(staleDir, 'nested.txt'), 'old');
    await writeFile(freshFile, 'keep');
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(staleDir, twoHoursAgo, twoHoursAgo);

    process.env.ATLBOARD_TMP_JANITOR_MAX_AGE_MS = '3600000';
    await cleanupStaleAtlboardTempFiles({ root });

    await expect(stat(staleDir)).rejects.toThrow();
    await expect(stat(freshFile)).resolves.toBeDefined();
  });
});
