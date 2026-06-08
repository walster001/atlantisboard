import { describe, expect, test } from 'bun:test';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import archiver from 'archiver';
import { ValidationError } from '../src/shared/errors/domainErrors.js';
import { BACKUP_FORMAT } from '../src/server/services/backupService/backupShared.js';
import {
  isAllowedBackupZipFileName,
  isAllowedBackupZipMimeType,
  isZipMagicHeader,
  validateBackupZipArchive,
} from '../src/server/services/backupService/backupImportValidation.js';

async function writeZipWithManifest(
  dir: string,
  fileName: string,
  manifest: Record<string, unknown>,
): Promise<string> {
  const zipPath = join(dir, fileName);
  const output = createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 1 } });
  archive.pipe(output);
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
  await archive.finalize();
  await finished(output);
  return zipPath;
}

describe('backup import validation helpers', () => {
  test('isZipMagicHeader accepts local and empty archive signatures', () => {
    expect(isZipMagicHeader(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(isZipMagicHeader(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(true);
    expect(isZipMagicHeader(Buffer.from([0x00, 0x00, 0x00, 0x00]))).toBe(false);
  });

  test('isAllowedBackupZipFileName requires .zip extension', () => {
    expect(isAllowedBackupZipFileName('backup.zip')).toBe(true);
    expect(isAllowedBackupZipFileName('BACKUP.ZIP')).toBe(true);
    expect(isAllowedBackupZipFileName('backup.tar')).toBe(false);
  });

  test('isAllowedBackupZipMimeType accepts zip and octet-stream', () => {
    expect(isAllowedBackupZipMimeType('application/zip')).toBe(true);
    expect(isAllowedBackupZipMimeType('application/x-zip-compressed')).toBe(true);
    expect(isAllowedBackupZipMimeType('application/octet-stream')).toBe(true);
    expect(isAllowedBackupZipMimeType('text/plain')).toBe(false);
  });
});

describe('validateBackupZipArchive', () => {
  test('rejects non-zip files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'atlboard-backup-import-test-'));
    try {
      const filePath = join(dir, 'not-a-zip.bin');
      await writeFile(filePath, 'hello world');
      await expect(validateBackupZipArchive(filePath)).rejects.toThrow(ValidationError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('rejects zip archives without manifest.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'atlboard-backup-import-test-'));
    try {
      const zipPath = join(dir, 'empty.zip');
      const output = createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 1 } });
      archive.pipe(output);
      archive.append('hello', { name: 'readme.txt' });
      await archive.finalize();
      await finished(output);
      await expect(validateBackupZipArchive(zipPath)).rejects.toThrow('manifest.json is missing');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('rejects unsupported manifest format', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'atlboard-backup-import-test-'));
    try {
      const zipPath = await writeZipWithManifest(dir, 'bad-format.zip', {
        format: 'other-backup-v9',
        mongoCollections: [],
      });
      await expect(validateBackupZipArchive(zipPath)).rejects.toThrow('Unsupported backup format');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('accepts atlboard-backup-v2 manifest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'atlboard-backup-import-test-'));
    try {
      const zipPath = await writeZipWithManifest(dir, 'valid.zip', {
        format: BACKUP_FORMAT,
        mongoCollections: ['users'],
        minioArchiveMethod: 'mc-mirror-v1',
      });
      const result = await validateBackupZipArchive(zipPath);
      expect(result.format).toBe(BACKUP_FORMAT);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
