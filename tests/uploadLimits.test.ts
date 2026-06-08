import { describe, expect, test } from 'bun:test';
import {
  BACKUP_IMPORT_DEFAULT_MB,
  BACKUP_IMPORT_MAX_MB_CEILING,
  BACKUP_IMPORT_MIN_MB,
  BOARD_IMPORT_DEFAULT_MB,
  BOARD_IMPORT_MAX_MB_CEILING,
  BOARD_IMPORT_MIN_MB,
  CARD_ATTACHMENT_DEFAULT_MB,
  CARD_ATTACHMENT_MAX_MB_CEILING,
  formatCardAttachmentMaxMb,
  resolveBackupImportMaxBytes,
  resolveBoardImportMaxBytes,
  resolveCardAttachmentMaxBytes,
} from '../src/shared/constants/uploadLimits.js';

const mbToBytes = (mb: number): number => mb * 1024 * 1024;

describe('resolveCardAttachmentMaxBytes', () => {
  test('defaults to 1 GB when env is empty', () => {
    expect(resolveCardAttachmentMaxBytes({})).toBe(mbToBytes(CARD_ATTACHMENT_DEFAULT_MB));
    expect(CARD_ATTACHMENT_DEFAULT_MB).toBe(1024);
  });

  test('uses CARD_ATTACHMENT_MAX_MB when set', () => {
    expect(resolveCardAttachmentMaxBytes({ CARD_ATTACHMENT_MAX_MB: '100' })).toBe(mbToBytes(100));
  });

  test('uses MAX_FILE_SIZE bytes when MB env is unset', () => {
    expect(resolveCardAttachmentMaxBytes({ MAX_FILE_SIZE: '1048576000' })).toBe(1048576000);
  });

  test('CARD_ATTACHMENT_MAX_MB overrides MAX_FILE_SIZE', () => {
    expect(
      resolveCardAttachmentMaxBytes({
        CARD_ATTACHMENT_MAX_MB: '25',
        MAX_FILE_SIZE: '1048576000',
      }),
    ).toBe(mbToBytes(25));
  });

  test('clamps MB to 4 GB ceiling', () => {
    expect(resolveCardAttachmentMaxBytes({ CARD_ATTACHMENT_MAX_MB: '9999' })).toBe(
      mbToBytes(CARD_ATTACHMENT_MAX_MB_CEILING),
    );
    expect(CARD_ATTACHMENT_MAX_MB_CEILING).toBe(4000);
  });

  test('clamps legacy MAX_FILE_SIZE to ceiling', () => {
    const overCeilingBytes = 5000 * 1024 * 1024;
    expect(resolveCardAttachmentMaxBytes({ MAX_FILE_SIZE: String(overCeilingBytes) })).toBe(
      mbToBytes(CARD_ATTACHMENT_MAX_MB_CEILING),
    );
  });
});

describe('formatCardAttachmentMaxMb', () => {
  test('rounds bytes to MB label', () => {
    expect(formatCardAttachmentMaxMb(1048576000)).toBe(1000);
    expect(formatCardAttachmentMaxMb(mbToBytes(CARD_ATTACHMENT_DEFAULT_MB))).toBe(1024);
  });
});

describe('resolveBoardImportMaxBytes', () => {
  test('defaults to 35 MB when env is empty', () => {
    expect(resolveBoardImportMaxBytes({})).toBe(mbToBytes(BOARD_IMPORT_DEFAULT_MB));
    expect(BOARD_IMPORT_DEFAULT_MB).toBe(35);
  });

  test('uses BOARD_IMPORT_MAX_MB when set', () => {
    expect(resolveBoardImportMaxBytes({ BOARD_IMPORT_MAX_MB: '100' })).toBe(mbToBytes(100));
  });

  test('clamps MB to 5–250 range', () => {
    expect(resolveBoardImportMaxBytes({ BOARD_IMPORT_MAX_MB: '1' })).toBe(mbToBytes(BOARD_IMPORT_MIN_MB));
    expect(BOARD_IMPORT_MIN_MB).toBe(5);
    expect(resolveBoardImportMaxBytes({ BOARD_IMPORT_MAX_MB: '9999' })).toBe(
      mbToBytes(BOARD_IMPORT_MAX_MB_CEILING),
    );
    expect(BOARD_IMPORT_MAX_MB_CEILING).toBe(250);
  });

  test('falls back to default for invalid env', () => {
    expect(resolveBoardImportMaxBytes({ BOARD_IMPORT_MAX_MB: 'not-a-number' })).toBe(
      mbToBytes(BOARD_IMPORT_DEFAULT_MB),
    );
  });
});

describe('resolveBackupImportMaxBytes', () => {
  test('defaults to 1024 MB when env is empty', () => {
    expect(resolveBackupImportMaxBytes({})).toBe(mbToBytes(BACKUP_IMPORT_DEFAULT_MB));
    expect(BACKUP_IMPORT_DEFAULT_MB).toBe(1024);
  });

  test('uses BACKUP_IMPORT_MAX_MB when set', () => {
    expect(resolveBackupImportMaxBytes({ BACKUP_IMPORT_MAX_MB: '500' })).toBe(mbToBytes(500));
  });

  test('clamps MB to 10–4000 range', () => {
    expect(resolveBackupImportMaxBytes({ BACKUP_IMPORT_MAX_MB: '1' })).toBe(mbToBytes(BACKUP_IMPORT_MIN_MB));
    expect(BACKUP_IMPORT_MIN_MB).toBe(10);
    expect(resolveBackupImportMaxBytes({ BACKUP_IMPORT_MAX_MB: '9999' })).toBe(
      mbToBytes(BACKUP_IMPORT_MAX_MB_CEILING),
    );
    expect(BACKUP_IMPORT_MAX_MB_CEILING).toBe(CARD_ATTACHMENT_MAX_MB_CEILING);
  });

  test('falls back to default for invalid env', () => {
    expect(resolveBackupImportMaxBytes({ BACKUP_IMPORT_MAX_MB: 'not-a-number' })).toBe(
      mbToBytes(BACKUP_IMPORT_DEFAULT_MB),
    );
  });
});
