import { describe, expect, it } from 'bun:test';
import {
  formatBackupRetentionLabel,
  normalizeBackupRetentionDays,
  parseBackupRetentionSelectValue,
} from '../src/shared/constants/backupRetention.js';

describe('backupRetention constants', () => {
  it('normalizes legacy retention to nearest preset', () => {
    expect(normalizeBackupRetentionDays(14)).toBe(10);
    expect(normalizeBackupRetentionDays(30)).toBe(30);
    expect(normalizeBackupRetentionDays(0)).toBe(0);
  });

  it('formats labels', () => {
    expect(formatBackupRetentionLabel(1)).toBe('1 day');
    expect(formatBackupRetentionLabel(30)).toBe('30 days');
    expect(formatBackupRetentionLabel(0)).toBe('Never');
  });

  it('parses select values', () => {
    expect(parseBackupRetentionSelectValue('90')).toBe(90);
    expect(parseBackupRetentionSelectValue('0')).toBe(0);
    expect(parseBackupRetentionSelectValue('14')).toBeNull();
  });
});
