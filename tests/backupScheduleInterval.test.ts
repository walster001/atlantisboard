import { describe, expect, it } from 'bun:test';
import {
  backupScheduleToMs,
  formatBackupScheduleLabel,
  resolveBackupScheduleInterval,
  resolveBackupScheduleIntervalMs,
} from '../src/shared/constants/backupScheduleInterval.js';

describe('backupScheduleInterval', () => {
  it('converts units to milliseconds', () => {
    expect(backupScheduleToMs(1, 'hours')).toBe(3_600_000);
    expect(backupScheduleToMs(2, 'days')).toBe(172_800_000);
    expect(backupScheduleToMs(1, 'weeks')).toBe(604_800_000);
    expect(backupScheduleToMs(1, 'months')).toBe(2_592_000_000);
  });

  it('formats labels', () => {
    expect(formatBackupScheduleLabel(1, 'hours')).toBe('1 hour');
    expect(formatBackupScheduleLabel(3, 'days')).toBe('3 days');
    expect(formatBackupScheduleLabel(2, 'weeks')).toBe('2 weeks');
  });

  it('resolves legacy day-only settings', () => {
    expect(resolveBackupScheduleInterval({ scheduleFrequencyDays: 7 })).toEqual({
      amount: 7,
      unit: 'days',
    });
  });

  it('prefers amount and unit when present', () => {
    expect(
      resolveBackupScheduleIntervalMs({
        scheduleIntervalAmount: 12,
        scheduleIntervalUnit: 'hours',
      }),
    ).toBe(43_200_000);
  });
});
