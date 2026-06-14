import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DISK_RESERVE_DEFAULT_MB,
  resolveDiskReserveBytes,
} from '../src/shared/constants/diskReserve.js';
import { InsufficientStorageError } from '../src/shared/errors/domainErrors.js';
import {
  assertDiskReserve,
  assertMongoDbDiskReserve,
  getFilesystemAvailableBytes,
  parseRequestContentLengthBytes,
  resolveMongoDbDiskCheckPath,
  resolveUploadBytesBudget,
} from '../src/server/utils/diskSpaceGuard.js';

describe('resolveDiskReserveBytes', () => {
  test('defaults to 500 MB', () => {
    expect(resolveDiskReserveBytes({})).toBe(DISK_RESERVE_DEFAULT_MB * 1024 * 1024);
    expect(DISK_RESERVE_DEFAULT_MB).toBe(500);
  });

  test('reads DISK_RESERVE_MB from env', () => {
    expect(resolveDiskReserveBytes({ DISK_RESERVE_MB: '256' })).toBe(256 * 1024 * 1024);
  });
});

describe('parseRequestContentLengthBytes', () => {
  test('parses a numeric header', () => {
    expect(parseRequestContentLengthBytes('152974157')).toBe(152974157);
  });

  test('returns null when header is missing or invalid', () => {
    expect(parseRequestContentLengthBytes(undefined)).toBeNull();
    expect(parseRequestContentLengthBytes('not-a-number')).toBeNull();
  });
});

describe('resolveUploadBytesBudget', () => {
  test('caps declared length by route max', () => {
    expect(
      resolveUploadBytesBudget({
        declaredContentLength: 200 * 1024 * 1024,
        maxUploadBytes: 50 * 1024 * 1024,
      }),
    ).toBe(50 * 1024 * 1024);
  });
});

describe('resolveMongoDbDiskCheckPath', () => {
  test('prefers MONGODB_DISK_CHECK_PATH', () => {
    const prev = process.env.MONGODB_DISK_CHECK_PATH;
    process.env.MONGODB_DISK_CHECK_PATH = '/data/mongodb';
    expect(resolveMongoDbDiskCheckPath()).toBe('/data/mongodb');
    if (prev === undefined) {
      delete process.env.MONGODB_DISK_CHECK_PATH;
    } else {
      process.env.MONGODB_DISK_CHECK_PATH = prev;
    }
  });
});

describe('assertDiskReserve', () => {
  test('allows operations when ample free space exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disk-reserve-'));
    try {
      await assertDiskReserve({
        path: dir,
        requiredBytes: 1024,
        reserveBytes: 0,
        context: 'test',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('rejects when required space exceeds availability', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disk-reserve-'));
    try {
      const available = await getFilesystemAvailableBytes(dir);
      await expect(
        assertDiskReserve({
          path: dir,
          requiredBytes: available + 1024 * 1024,
          reserveBytes: 0,
          context: 'test',
        }),
      ).rejects.toBeInstanceOf(InsufficientStorageError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('assertMongoDbDiskReserve', () => {
  test('skips in test environment', async () => {
    await expect(assertMongoDbDiskReserve()).resolves.toBeUndefined();
  });
});
