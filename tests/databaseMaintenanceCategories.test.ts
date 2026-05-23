import { describe, expect, test } from 'bun:test';
import { DATABASE_CLEANUP_CATEGORY_IDS } from '../src/shared/types/adminDatabaseMaintenance.js';
import { listSafeCleanupCategoryIds } from '../src/server/services/databaseMaintenanceService.js';

describe('database maintenance categories', () => {
  test('safe cleanup ids are a subset of all category ids', () => {
    const safe = listSafeCleanupCategoryIds();
    for (const id of safe) {
      expect(DATABASE_CLEANUP_CATEGORY_IDS.includes(id)).toBe(true);
    }
  });

  test('boards without workspace is not auto-cleaned', () => {
    expect(listSafeCleanupCategoryIds()).not.toContain('orphan-boards-no-workspace');
  });

  test('stale job categories are safe to auto-clean', () => {
    const safe = listSafeCleanupCategoryIds();
    expect(safe).toContain('stale-import-jobs');
    expect(safe).toContain('stale-backup-jobs');
  });
});
