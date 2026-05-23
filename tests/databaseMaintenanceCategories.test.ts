import { describe, expect, test } from 'bun:test';
import { DATABASE_CLEANUP_CATEGORY_IDS } from '../src/shared/types/adminDatabaseMaintenance.js';
import {
  listKnownApplicationCollectionNames,
  listSafeCleanupCategoryIds,
} from '../src/server/services/databaseMaintenanceService.js';
import { LEGACY_UNUSED_MONGO_COLLECTIONS } from '../src/server/services/startupMigrations.js';

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

  test('themes is a known application collection', () => {
    expect(listKnownApplicationCollectionNames()).toContain('themes');
  });

  test('legacy template collections are not part of the application schema', () => {
    const known = new Set(listKnownApplicationCollectionNames());
    for (const legacy of LEGACY_UNUSED_MONGO_COLLECTIONS) {
      expect(known.has(legacy)).toBe(false);
    }
  });
});
