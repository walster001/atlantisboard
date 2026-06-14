import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InsufficientStorageError } from '../src/shared/errors/domainErrors.js';
import {
  assertUploadDiskHeadroom,
  getFilesystemAvailableBytes,
  parseRequestContentLengthBytes,
  resolveUploadBytesBudget,
} from '../src/server/utils/uploadDiskHeadroom.js';

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

  test('uses route max when Content-Length is unknown', () => {
    expect(
      resolveUploadBytesBudget({
        declaredContentLength: null,
        maxUploadBytes: 1024 * 1024 * 1024,
      }),
    ).toBe(1024 * 1024 * 1024);
  });
});

describe('assertUploadDiskHeadroom', () => {
  test('allows uploads when temp dir has ample free space', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upload-headroom-'));
    try {
      const available = await getFilesystemAvailableBytes(dir);
      await assertUploadDiskHeadroom({
        directory: dir,
        requiredBytes: 1024,
        reserveBytes: 0,
      });
      expect(available).toBeGreaterThan(1024);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('rejects uploads when required space exceeds availability', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upload-headroom-'));
    try {
      const available = await getFilesystemAvailableBytes(dir);
      await expect(
        assertUploadDiskHeadroom({
          directory: dir,
          requiredBytes: available + 1024 * 1024,
          reserveBytes: 0,
        }),
      ).rejects.toBeInstanceOf(InsufficientStorageError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
