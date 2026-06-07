import { describe, expect, it, spyOn } from 'bun:test';
import {
  buildDefaultBackupFilename,
  formatBackupFolderDisplayLabel,
  formatBackupFolderTimestamp,
  isValidBackupFolderId,
  newBackupFolderId,
  parseBackupFolderMillis,
} from '../src/shared/utils/backupFolderNaming.js';

describe('backupFolderNaming', () => {
  it('formats folder timestamp as DD-MM-YY_HHMMAM|PM', () => {
    const formatted = formatBackupFolderTimestamp(new Date(2026, 5, 7, 20, 15, 0, 0));
    expect(formatted).toBe('07-06-26_0815PM');
  });

  it('builds default backup filename with date and time', () => {
    expect(buildDefaultBackupFilename(new Date(2026, 5, 7, 8, 15, 0, 0))).toBe(
      'backup-07-06-26_0815AM.zip',
    );
  });

  it('parses display folder ids for retention', () => {
    const ms = parseBackupFolderMillis('07-06-26_0815PM');
    expect(ms).not.toBeNull();
    expect(new Date(ms!).getHours()).toBe(20);
    expect(new Date(ms!).getMinutes()).toBe(15);
  });

  it('parses legacy epoch folder ids', () => {
    expect(parseBackupFolderMillis('1780838381504_2026-06-07T13-19-41-504Z')).toBe(1780838381504);
  });

  it('validates display and legacy folder ids', () => {
    expect(isValidBackupFolderId('07-06-26_0815PM')).toBe(true);
    expect(isValidBackupFolderId('07-06-26_0815PM-2')).toBe(true);
    expect(isValidBackupFolderId('1780838381504_2026-06-07T13-19-41-504Z')).toBe(true);
    expect(isValidBackupFolderId('bad/id')).toBe(false);
  });

  it('dedupes folder ids within the same minute', () => {
    const frozenNow = new Date(2026, 5, 7, 20, 15, 0, 0);
    const RealDate = globalThis.Date;
    const dateSpy = spyOn(globalThis, 'Date').mockImplementation(
      ((value?: string | number | Date) =>
        value === undefined ? new RealDate(frozenNow.getTime()) : new RealDate(value)) as unknown as typeof Date,
    );
    try {
      const existing = new Set(['07-06-26_0815PM']);
      expect(newBackupFolderId(existing)).toBe('07-06-26_0815PM-2');
    } finally {
      dateSpy.mockRestore();
    }
  });

  it('formats legacy ids for display', () => {
    const label = formatBackupFolderDisplayLabel('1780838381504_2026-06-07T13-19-41-504Z');
    expect(label).toMatch(/^[0-9]{2}-[0-9]{2}-[0-9]{2}_[0-9]{4}(AM|PM)$/);
  });
});
