import { describe, expect, test } from 'bun:test';
import { Activity } from '../src/server/models/Activity.js';
import { User } from '../src/server/models/User.js';
import { Workspace } from '../src/server/models/Workspace.js';
import { Board } from '../src/server/models/Board.js';
import { List } from '../src/server/models/List.js';
import { Card } from '../src/server/models/Card.js';
import { Session } from '../src/server/models/Session.js';
import { InviteLink } from '../src/server/models/InviteLink.js';
import { BoardLabel } from '../src/server/models/BoardLabel.js';
import { ImportJob } from '../src/server/models/ImportJob.js';
import { Notification } from '../src/server/models/Notification.js';
import { AdminConfig } from '../src/server/models/AdminConfig.js';
import { BackupJob } from '../src/server/models/BackupJob.js';
import { PermissionSet } from '../src/server/models/PermissionSet.js';
import { RoleDefinition } from '../src/server/models/RoleDefinition.js';
import { BoardImportPlaceholder } from '../src/server/models/BoardImportPlaceholder.js';
import { BoardTheme } from '../src/server/models/BoardTheme.js';
import { DATABASE_CLEANUP_CATEGORY_IDS } from '../src/shared/types/adminDatabaseMaintenance.js';
import {
  applicationMongoCollectionMeta,
  listApplicationMongoCollectionNames,
} from '../src/shared/constants/applicationMongoCollections.js';
import {
  listKnownApplicationCollectionNames,
  listSafeCleanupCategoryIds,
} from '../src/server/services/databaseMaintenanceService.js';
import { LEGACY_UNUSED_MONGO_COLLECTIONS } from '../src/server/services/startupMigrations.js';

const ALL_MODELS = [
  Activity,
  User,
  Workspace,
  Board,
  List,
  Card,
  Session,
  InviteLink,
  BoardLabel,
  ImportJob,
  Notification,
  AdminConfig,
  BackupJob,
  PermissionSet,
  RoleDefinition,
  BoardImportPlaceholder,
  BoardTheme,
] as const;

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

  test('every Mongoose model collection is registered with label and description', () => {
    const registered = new Set<string>(listApplicationMongoCollectionNames());
    for (const model of ALL_MODELS) {
      const name = model.collection.name;
      expect(registered.has(name)).toBe(true);
      const meta = applicationMongoCollectionMeta(name);
      expect(meta?.label.trim()).not.toBe('');
      expect(meta?.description.trim()).not.toBe('');
    }
  });

  test('activities metadata documents board and member audit storage', () => {
    const meta = applicationMongoCollectionMeta('activities');
    expect(meta?.description.toLowerCase()).toContain('member audit');
    expect(meta?.description.toLowerCase()).toContain('board activity');
  });

  test('legacy template collections are not part of the application schema', () => {
    const known = new Set(listKnownApplicationCollectionNames());
    for (const legacy of LEGACY_UNUSED_MONGO_COLLECTIONS) {
      expect(known.has(legacy)).toBe(false);
    }
  });
});
