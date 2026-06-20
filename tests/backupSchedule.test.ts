import { describe, expect, it } from 'bun:test';
import {
  isBackupScheduleDue,
  scheduledRunFilename,
} from '../src/server/services/backupService/backupSchedule.js';
import {
  buildScheduleFolderId,
  isScheduledBackupFolderId,
  isValidBackupFolderId,
} from '../src/shared/utils/backupFolderNaming.js';

describe('backup schedule helpers', () => {
  it('recognises schedule folder ids', () => {
    const id = buildScheduleFolderId('507f1f77bcf86cd799439011');
    expect(isScheduledBackupFolderId(id)).toBe(true);
    expect(isValidBackupFolderId(id)).toBe(true);
  });

  it('detects when a schedule is due', () => {
    const createdAtMs = 0;
    const intervalMs = 60 * 60 * 1000;
    expect(isBackupScheduleDue({ lastRunAtMs: null, createdAtMs, intervalMs, nowMs: intervalMs })).toBe(true);
    expect(isBackupScheduleDue({ lastRunAtMs: null, createdAtMs, intervalMs, nowMs: intervalMs - 1 })).toBe(false);
    expect(
      isBackupScheduleDue({ lastRunAtMs: 1000, createdAtMs, intervalMs, nowMs: 1000 + intervalMs }),
    ).toBe(true);
  });

  it('builds timestamped run filenames from schedule template', () => {
    const name = scheduledRunFilename('nightly.zip', new Date(2026, 4, 7, 20, 15, 0));
    expect(name).toMatch(/^nightly-\d{2}-\d{2}-\d{2}_\d{4}(AM|PM)\.zip$/);
  });
});
