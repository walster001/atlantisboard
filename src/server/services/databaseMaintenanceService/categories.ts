import type { DatabaseCleanupCategoryId } from '../../../shared/types/adminDatabaseMaintenance.js';
import { Activity } from '../../models/Activity.js';
import { BackupJob } from '../../models/BackupJob.js';
import { Board } from '../../models/Board.js';
import { BoardImportPlaceholder } from '../../models/BoardImportPlaceholder.js';
import { BoardLabel } from '../../models/BoardLabel.js';
import { Card } from '../../models/Card.js';
import { ImportJob } from '../../models/ImportJob.js';
import { List } from '../../models/List.js';
import { Notification } from '../../models/Notification.js';
import { Session } from '../../models/Session.js';
import {
  STALE_JOB_DAYS,
  countOrphanInviteLinks,
  countOrphansByLookup,
  deleteOrphanInviteLinks,
  deleteOrphansByLookup,
  staleJobCutoff,
  type CategoryDefinition,
} from './typesAndHelpers.js';

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

export const CATEGORY_DEFINITIONS = buildCategoryDefinitions();

export const CATEGORY_BY_ID = new Map<DatabaseCleanupCategoryId, CategoryDefinition>(
  CATEGORY_DEFINITIONS.map((def) => [def.id, def]),
);
