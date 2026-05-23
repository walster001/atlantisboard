import mongoose, { type Model, type PipelineStage, type Types } from 'mongoose';
import {
  DATABASE_CLEANUP_CATEGORY_IDS,
  type AdminDatabaseCleanupResult,
  type AdminDatabaseMaintenanceSnapshot,
  type DatabaseCleanupCategoryId,
  type DatabaseCleanupCategoryResult,
  type DatabaseCleanupCategorySnapshot,
  type DatabaseCollectionStat,
} from '../../shared/types/adminDatabaseMaintenance.js';
import { Activity } from '../models/Activity.js';
import { BackupJob } from '../models/BackupJob.js';
import { Board } from '../models/Board.js';
import { BoardImportPlaceholder } from '../models/BoardImportPlaceholder.js';
import { BoardLabel } from '../models/BoardLabel.js';
import { Card } from '../models/Card.js';
import { ImportJob } from '../models/ImportJob.js';
import { InviteLink } from '../models/InviteLink.js';
import { List } from '../models/List.js';
import { Notification } from '../models/Notification.js';
import { Session } from '../models/Session.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { logger } from '../utils/logger.js';

/** Matches scheduled import/backup job cleanup in `cronJobs.ts`. */
const STALE_JOB_DAYS = 2;

const KNOWN_COLLECTIONS = new Set<string>([
  'users',
  'workspaces',
  'boards',
  'lists',
  'cards',
  'activities',
  'sessions',
  'invitelinks',
  'boardlabels',
  'importjobs',
  'notifications',
  'adminconfigs',
  'backupjobs',
  'permissionsets',
  'roledefinitions',
  'boardimportplaceholders',
  'themes',
]);

/** Application MongoDB collection names shown as "Known" in Admin → Database. */
export function listKnownApplicationCollectionNames(): readonly string[] {
  return [...KNOWN_COLLECTIONS].sort((a, b) => a.localeCompare(b));
}

const ORPHAN_DELETE_BATCH = 2000;

interface CategoryDefinition {
  readonly id: DatabaseCleanupCategoryId;
  readonly label: string;
  readonly description: string;
  readonly safeToDelete: boolean;
  readonly count: () => Promise<number>;
  readonly cleanup: () => Promise<number>;
}

function staleJobCutoff(): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - STALE_JOB_DAYS);
  return cutoff;
}

async function countOrphansByLookup(
  model: Model<unknown>,
  localField: string,
  foreignCollection: string,
  extraMatch?: Record<string, unknown>,
): Promise<number> {
  const pipeline: PipelineStage[] = [];
  if (extraMatch != null) {
    pipeline.push({ $match: extraMatch });
  }
  pipeline.push(
    {
      $lookup: {
        from: foreignCollection,
        localField,
        foreignField: '_id',
        as: '_parent',
      },
    },
    { $match: { _parent: { $size: 0 } } },
    { $count: 'n' },
  );
  const rows = await model.aggregate<{ n: number }>(pipeline);
  return rows[0]?.n ?? 0;
}

async function deleteOrphansByLookup(
  model: Model<unknown>,
  localField: string,
  foreignCollection: string,
  extraMatch?: Record<string, unknown>,
): Promise<number> {
  let totalDeleted = 0;
  for (;;) {
    const pipeline: PipelineStage[] = [];
    if (extraMatch != null) {
      pipeline.push({ $match: extraMatch });
    }
    pipeline.push(
      {
        $lookup: {
          from: foreignCollection,
          localField,
          foreignField: '_id',
          as: '_parent',
        },
      },
      { $match: { _parent: { $size: 0 } } },
      { $limit: ORPHAN_DELETE_BATCH },
      { $project: { _id: 1 } },
    );
    const batch = await model.aggregate<{ _id: Types.ObjectId }>(pipeline);
    if (batch.length === 0) {
      break;
    }
    const result = await model.deleteMany({ _id: { $in: batch.map((row) => row._id) } });
    totalDeleted += result.deletedCount ?? 0;
    if (batch.length < ORPHAN_DELETE_BATCH) {
      break;
    }
  }
  return totalDeleted;
}

async function countOrphanInviteLinks(): Promise<number> {
  const rows = await InviteLink.aggregate<{ n: number }>([
    {
      $facet: {
        workspace: [
          { $match: { type: 'workspace', workspaceId: { $exists: true, $ne: null } } },
          {
            $lookup: {
              from: 'workspaces',
              localField: 'workspaceId',
              foreignField: '_id',
              as: '_p',
            },
          },
          { $match: { _p: { $size: 0 } } },
          { $count: 'n' },
        ],
        board: [
          { $match: { type: 'board', boardId: { $exists: true, $ne: null } } },
          {
            $lookup: {
              from: 'boards',
              localField: 'boardId',
              foreignField: '_id',
              as: '_p',
            },
          },
          { $match: { _p: { $size: 0 } } },
          { $count: 'n' },
        ],
      },
    },
  ]);
  const facet = rows[0];
  if (facet == null) {
    return 0;
  }
  const workspace = (facet as { workspace?: { n: number }[] }).workspace?.[0]?.n ?? 0;
  const board = (facet as { board?: { n: number }[] }).board?.[0]?.n ?? 0;
  return workspace + board;
}

async function deleteOrphanInviteLinks(): Promise<number> {
  let total = 0;
  for (const spec of [
    { type: 'workspace' as const, field: 'workspaceId', from: 'workspaces' },
    { type: 'board' as const, field: 'boardId', from: 'boards' },
  ]) {
    for (;;) {
      const batch = await InviteLink.aggregate<{ _id: Types.ObjectId }>([
        { $match: { type: spec.type, [spec.field]: { $exists: true, $ne: null } } },
        {
          $lookup: {
            from: spec.from,
            localField: spec.field,
            foreignField: '_id',
            as: '_p',
          },
        },
        { $match: { _p: { $size: 0 } } },
        { $limit: ORPHAN_DELETE_BATCH },
        { $project: { _id: 1 } },
      ]);
      if (batch.length === 0) {
        break;
      }
      const result = await InviteLink.deleteMany({ _id: { $in: batch.map((row) => row._id) } });
      total += result.deletedCount ?? 0;
      if (batch.length < ORPHAN_DELETE_BATCH) {
        break;
      }
    }
  }
  return total;
}

function buildCategoryDefinitions(): readonly CategoryDefinition[] {
  return [
    {
      id: 'stale-import-jobs',
      label: 'Stale import jobs',
      description: `Completed or failed import jobs older than ${STALE_JOB_DAYS} days (same as nightly cleanup).`,
      safeToDelete: true,
      count: async () => {
        const cutoff = staleJobCutoff();
        return ImportJob.countDocuments({
          status: { $in: ['completed', 'failed'] },
          createdAt: { $lt: cutoff },
        });
      },
      cleanup: async () => {
        const cutoff = staleJobCutoff();
        const result = await ImportJob.deleteMany({
          status: { $in: ['completed', 'failed'] },
          createdAt: { $lt: cutoff },
        });
        return result.deletedCount ?? 0;
      },
    },
    {
      id: 'stale-backup-jobs',
      label: 'Stale backup jobs',
      description: `Completed or failed backup/restore job records older than ${STALE_JOB_DAYS} days.`,
      safeToDelete: true,
      count: async () => {
        const cutoff = staleJobCutoff();
        return BackupJob.countDocuments({
          status: { $in: ['completed', 'failed'] },
          createdAt: { $lt: cutoff },
        });
      },
      cleanup: async () => {
        const cutoff = staleJobCutoff();
        const result = await BackupJob.deleteMany({
          status: { $in: ['completed', 'failed'] },
          createdAt: { $lt: cutoff },
        });
        return result.deletedCount ?? 0;
      },
    },
    {
      id: 'expired-sessions',
      label: 'Expired sessions',
      description: 'Session rows past their expiry time (TTL may lag; safe to purge).',
      safeToDelete: true,
      count: async () => Session.countDocuments({ expiresAt: { $lt: new Date() } }),
      cleanup: async () => {
        const result = await Session.deleteMany({ expiresAt: { $lt: new Date() } });
        return result.deletedCount ?? 0;
      },
    },
    {
      id: 'expired-notifications',
      label: 'Expired notifications',
      description: 'Notification rows past their expiry time (TTL may lag; safe to purge).',
      safeToDelete: true,
      count: async () => Notification.countDocuments({ expiresAt: { $lt: new Date() } }),
      cleanup: async () => {
        const result = await Notification.deleteMany({ expiresAt: { $lt: new Date() } });
        return result.deletedCount ?? 0;
      },
    },
    {
      id: 'orphan-lists',
      label: 'Lists without a board',
      description: 'List documents whose board no longer exists.',
      safeToDelete: true,
      count: () => countOrphansByLookup(List, 'boardId', 'boards'),
      cleanup: () => deleteOrphansByLookup(List, 'boardId', 'boards'),
    },
    {
      id: 'orphan-cards-no-board',
      label: 'Cards without a board',
      description: 'Card documents whose board was removed.',
      safeToDelete: true,
      count: () => countOrphansByLookup(Card, 'boardId', 'boards'),
      cleanup: () => deleteOrphansByLookup(Card, 'boardId', 'boards'),
    },
    {
      id: 'orphan-cards-no-list',
      label: 'Cards without a list',
      description: 'Card documents whose list was removed.',
      safeToDelete: true,
      count: () => countOrphansByLookup(Card, 'listId', 'lists'),
      cleanup: () => deleteOrphansByLookup(Card, 'listId', 'lists'),
    },
    {
      id: 'orphan-board-labels',
      label: 'Labels without a board',
      description: 'Board label documents referencing a deleted board.',
      safeToDelete: true,
      count: () => countOrphansByLookup(BoardLabel, 'boardId', 'boards'),
      cleanup: () => deleteOrphansByLookup(BoardLabel, 'boardId', 'boards'),
    },
    {
      id: 'orphan-boards-no-workspace',
      label: 'Boards without a workspace',
      description: 'Board documents whose workspace was removed.',
      safeToDelete: false,
      count: () => countOrphansByLookup(Board, 'workspaceId', 'workspaces'),
      cleanup: () => deleteOrphansByLookup(Board, 'workspaceId', 'workspaces'),
    },
    {
      id: 'orphan-activities-no-board',
      label: 'Activities without a board',
      description: 'Activity log rows for boards that no longer exist.',
      safeToDelete: true,
      count: () => countOrphansByLookup(Activity, 'boardId', 'boards'),
      cleanup: () => deleteOrphansByLookup(Activity, 'boardId', 'boards'),
    },
    {
      id: 'orphan-activities-no-card',
      label: 'Activities without a card',
      description: 'Activity rows with a cardId pointing at a deleted card.',
      safeToDelete: true,
      count: () =>
        countOrphansByLookup(Activity, 'cardId', 'cards', {
          cardId: { $exists: true, $ne: null },
        }),
      cleanup: () =>
        deleteOrphansByLookup(Activity, 'cardId', 'cards', {
          cardId: { $exists: true, $ne: null },
        }),
    },
    {
      id: 'orphan-board-import-placeholders',
      label: 'Import placeholders without a board',
      description: 'Trello/Wekan placeholder members for boards that were deleted.',
      safeToDelete: true,
      count: () => countOrphansByLookup(BoardImportPlaceholder, 'boardId', 'boards'),
      cleanup: () => deleteOrphansByLookup(BoardImportPlaceholder, 'boardId', 'boards'),
    },
    {
      id: 'orphan-invite-links',
      label: 'Invite links without target',
      description: 'Workspace or board invite links whose target resource was deleted.',
      safeToDelete: true,
      count: countOrphanInviteLinks,
      cleanup: deleteOrphanInviteLinks,
    },
    {
      id: 'orphan-notifications-no-user',
      label: 'Notifications without a user',
      description: 'In-app notifications for deleted user accounts.',
      safeToDelete: true,
      count: () => countOrphansByLookup(Notification, 'userId', 'users'),
      cleanup: () => deleteOrphansByLookup(Notification, 'userId', 'users'),
    },
    {
      id: 'orphan-notifications-no-board',
      label: 'Notifications without a board',
      description: 'Notifications with relatedBoardId pointing at a removed board.',
      safeToDelete: true,
      count: () =>
        countOrphansByLookup(Notification, 'relatedBoardId', 'boards', {
          relatedBoardId: { $exists: true, $ne: null },
        }),
      cleanup: () =>
        deleteOrphansByLookup(Notification, 'relatedBoardId', 'boards', {
          relatedBoardId: { $exists: true, $ne: null },
        }),
    },
    {
      id: 'orphan-notifications-no-card',
      label: 'Notifications without a card',
      description: 'Notifications with relatedCardId pointing at a removed card.',
      safeToDelete: true,
      count: () =>
        countOrphansByLookup(Notification, 'relatedCardId', 'cards', {
          relatedCardId: { $exists: true, $ne: null },
        }),
      cleanup: () =>
        deleteOrphansByLookup(Notification, 'relatedCardId', 'cards', {
          relatedCardId: { $exists: true, $ne: null },
        }),
    },
    {
      id: 'orphan-import-jobs-no-user',
      label: 'Import jobs without a user',
      description: 'Import job records whose initiating user was deleted.',
      safeToDelete: true,
      count: () => countOrphansByLookup(ImportJob, 'userId', 'users'),
      cleanup: () => deleteOrphansByLookup(ImportJob, 'userId', 'users'),
    },
  ];
}

const CATEGORY_DEFINITIONS = buildCategoryDefinitions();

const CATEGORY_BY_ID = new Map<DatabaseCleanupCategoryId, CategoryDefinition>(
  CATEGORY_DEFINITIONS.map((def) => [def.id, def]),
);

async function readMongoStats(): Promise<{
  databaseName: string;
  mongoVersion: string | null;
  dataSizeMb: number | null;
  storageSizeMb: number | null;
}> {
  const db = mongoose.connection.db;
  if (db == null) {
    return {
      databaseName: '',
      mongoVersion: null,
      dataSizeMb: null,
      storageSizeMb: null,
    };
  }
  let mongoVersion: string | null = null;
  try {
    const buildInfo = (await db.admin().command({ buildInfo: 1 })) as { version?: string };
    mongoVersion = typeof buildInfo.version === 'string' ? buildInfo.version : null;
  } catch (error) {
    logger.warn({ error }, 'Could not read MongoDB version for database maintenance');
  }
  let dataSizeMb: number | null = null;
  let storageSizeMb: number | null = null;
  try {
    const stats = (await db.stats()) as { dataSize?: number; storageSize?: number };
    if (typeof stats.dataSize === 'number' && Number.isFinite(stats.dataSize)) {
      dataSizeMb = stats.dataSize / (1024 * 1024);
    }
    if (typeof stats.storageSize === 'number' && Number.isFinite(stats.storageSize)) {
      storageSizeMb = stats.storageSize / (1024 * 1024);
    }
  } catch (error) {
    logger.warn({ error }, 'Could not read MongoDB db.stats for database maintenance');
  }
  return {
    databaseName: db.databaseName,
    mongoVersion,
    dataSizeMb,
    storageSizeMb,
  };
}

async function readCollectionStats(): Promise<readonly DatabaseCollectionStat[]> {
  const db = mongoose.connection.db;
  if (db == null) {
    return [];
  }
  const collections = await db.listCollections({}, { nameOnly: false }).toArray();
  const stats: DatabaseCollectionStat[] = [];
  for (const coll of collections) {
    const name = coll.name;
    if (name.startsWith('system.')) {
      continue;
    }
    try {
      const count = await db.collection(name).countDocuments();
      stats.push({
        name,
        documentCount: count,
        knownToApp: KNOWN_COLLECTIONS.has(name),
      });
    } catch (error) {
      logger.warn({ error, collection: name }, 'Could not count collection documents');
    }
  }
  return stats.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getDatabaseMaintenanceSnapshot(): Promise<AdminDatabaseMaintenanceSnapshot> {
  const [mongoStats, collections, categoryCounts] = await Promise.all([
    readMongoStats(),
    readCollectionStats(),
    Promise.all(
      CATEGORY_DEFINITIONS.map(async (def) => ({
        def,
        count: await def.count(),
      })),
    ),
  ]);

  const cleanupCategories: DatabaseCleanupCategorySnapshot[] = categoryCounts.map(({ def, count }) => ({
    id: def.id,
    label: def.label,
    description: def.description,
    count,
    safeToDelete: def.safeToDelete,
  }));

  const totalDocuments = collections.reduce((sum, row) => sum + row.documentCount, 0);

  return {
    generatedAt: new Date().toISOString(),
    databaseName: mongoStats.databaseName,
    mongoVersion: mongoStats.mongoVersion,
    dataSizeMb: mongoStats.dataSizeMb,
    storageSizeMb: mongoStats.storageSizeMb,
    totalDocuments,
    collections,
    cleanupCategories,
  };
}

export async function runDatabaseCleanup(
  categoryIds: readonly DatabaseCleanupCategoryId[],
  adminUserId: string,
): Promise<AdminDatabaseCleanupResult> {
  const uniqueIds = [...new Set(categoryIds)];
  for (const id of uniqueIds) {
    if (!DATABASE_CLEANUP_CATEGORY_IDS.includes(id)) {
      throw new Error(`Invalid cleanup category: ${id}`);
    }
  }

  const results: DatabaseCleanupCategoryResult[] = [];

  for (const id of uniqueIds) {
    const def = CATEGORY_BY_ID.get(id);
    if (def == null) {
      continue;
    }
    const deletedCount = await def.cleanup();
    results.push({ id, deletedCount });
    logger.info({ category: id, deletedCount, adminUserId }, 'Admin database cleanup category completed');
  }

  const totalDeleted = results.reduce((sum, row) => sum + row.deletedCount, 0);

  logAuditEvent({
    userId: adminUserId,
    action: 'admin.database.cleanup',
    resourceType: 'system',
    resourceId: 'database',
    metadata: { categories: uniqueIds, results, totalDeleted },
    timestamp: new Date(),
  });

  return {
    ranAt: new Date().toISOString(),
    results,
    totalDeleted,
  };
}

export function listSafeCleanupCategoryIds(): readonly DatabaseCleanupCategoryId[] {
  return CATEGORY_DEFINITIONS.filter((def) => def.safeToDelete).map((def) => def.id);
}
