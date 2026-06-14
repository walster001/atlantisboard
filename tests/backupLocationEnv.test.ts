import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyBackupLocation,
  checkBackupLocationPath,
  getResolvedBackupLocationFromEnv,
  normalizeBackupLocationPath,
} from '../src/server/services/backupLocationEnv.js';
import { assertBackupFileUnderLocation } from '../src/server/services/backupService/backupDownload.js';
import { ForbiddenError } from '../src/shared/errors/domainErrors.js';
import { DOCKER_FULLSTACK_BACKUP_LOCATION, isDockerFullstackDeployment } from '../src/shared/constants/backupLocationEnv.js';
import { resolveEnvFilePath, upsertEnvFileVariable } from '../src/server/utils/envFileWriter.js';

describe('normalizeBackupLocationPath', () => {
  it('requires absolute paths', () => {
    expect(() => normalizeBackupLocationPath('relative/path')).toThrow(/absolute/);
  });

  it('normalizes absolute paths', () => {
    const normalized = normalizeBackupLocationPath('/var/backups/atlboard/');
    expect(normalized.endsWith('/var/backups/atlboard') || normalized.includes('backups')).toBe(true);
  });

  it('accepts the Docker fullstack default container path', () => {
    expect(normalizeBackupLocationPath(DOCKER_FULLSTACK_BACKUP_LOCATION)).toBe('/data/backups');
  });
});

describe('isDockerFullstackDeployment', () => {
  afterEach(() => {
    delete process.env.ATL_DOCKER_FULLSTACK;
  });

  it('detects Docker fullstack via ATL_DOCKER_FULLSTACK', () => {
    process.env.ATL_DOCKER_FULLSTACK = 'true';
    expect(isDockerFullstackDeployment()).toBe(true);
    delete process.env.ATL_DOCKER_FULLSTACK;
    expect(isDockerFullstackDeployment()).toBe(false);
  });
});

describe('applyBackupLocation', () => {
  let tempRoot = '';

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'atl-backup-loc-'));
    delete process.env.BACKUP_LOCATION;
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    delete process.env.BACKUP_LOCATION;
  });

  it('creates missing directories when requested', async () => {
    const target = join(tempRoot, 'backups');
    const status = await applyBackupLocation({ path: target, createIfMissing: true });
    expect(status.configured).toBe(true);
    expect(status.path).toBe(normalizeBackupLocationPath(target));
    expect(status.exists).toBe(true);
    expect(status.writable).toBe(true);
    expect(status.dockerFullstack).toBe(false);
    expect(status.suggestedPath).toBeNull();
    expect(getResolvedBackupLocationFromEnv()).toBe(status.path);
  });

  it('rejects missing directories without createIfMissing', async () => {
    const target = join(tempRoot, 'missing');
    await expect(applyBackupLocation({ path: target, createIfMissing: false })).rejects.toThrow(
      /does not exist/i,
    );
  });
});

describe('checkBackupLocationPath', () => {
  let tempRoot = '';

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'atl-backup-check-'));
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('reports existing writable directories', async () => {
    const dir = join(tempRoot, 'exists');
    mkdirSync(dir);
    const result = await checkBackupLocationPath(dir);
    expect(result.exists).toBe(true);
    expect(result.isDirectory).toBe(true);
    expect(result.writable).toBe(true);
  });
});

describe('assertBackupFileUnderLocation', () => {
  it('allows files under the backup root', () => {
    expect(() =>
      assertBackupFileUnderLocation('/var/backups/atlboard/job/file.zip', '/var/backups/atlboard'),
    ).not.toThrow();
  });

  it('blocks path traversal outside the backup root', () => {
    expect(() =>
      assertBackupFileUnderLocation('/etc/passwd', '/var/backups/atlboard'),
    ).toThrow(ForbiddenError);
  });
});

describe('upsertEnvFileVariable', () => {
  let tempRoot = '';

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'atl-env-writer-'));
    process.env.ATL_ENV_FILE = join(tempRoot, '.env');
    writeFileSync(process.env.ATL_ENV_FILE, 'NODE_ENV=development\n');
  });

  afterEach(() => {
    delete process.env.ATL_ENV_FILE;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('resolves ATL_ENV_FILE before cwd .env', () => {
    const envFile = process.env.ATL_ENV_FILE;
    expect(envFile).toBeDefined();
    if (envFile === undefined) {
      throw new Error('ATL_ENV_FILE must be set for this test');
    }
    expect(resolveEnvFilePath()).toBe(envFile);
  });

  it('updates an existing key', async () => {
    writeFileSync(process.env.ATL_ENV_FILE!, 'BACKUP_LOCATION=/old\n');
    expect(upsertEnvFileVariable('BACKUP_LOCATION', '/new/path')).toBe(true);
    const text = await Bun.file(process.env.ATL_ENV_FILE!).text();
    expect(text).toContain('BACKUP_LOCATION=/new/path');
    expect(text).not.toContain('/old');
  });

  it('appends a missing key', async () => {
    expect(upsertEnvFileVariable('BACKUP_LOCATION', '/var/backups')).toBe(true);
    const text = await Bun.file(process.env.ATL_ENV_FILE!).text();
    expect(text).toContain('BACKUP_LOCATION=/var/backups');
  });

  it('removes duplicate key lines when upserting', async () => {
    writeFileSync(
      process.env.ATL_ENV_FILE!,
      'BACKUP_LOCATION=/first\n# comment\nBACKUP_LOCATION=/duplicate\n',
    );
    expect(upsertEnvFileVariable('BACKUP_LOCATION', '/final')).toBe(true);
    const text = await Bun.file(process.env.ATL_ENV_FILE!).text();
    expect(text).toContain('BACKUP_LOCATION=/final');
    expect(text).not.toContain('/first');
    expect(text).not.toContain('/duplicate');
    expect(text.match(/^BACKUP_LOCATION=/gm)?.length).toBe(1);
  });
});
