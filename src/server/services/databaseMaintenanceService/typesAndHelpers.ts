import { type Model, type PipelineStage, type Types } from 'mongoose';
import {
  listApplicationMongoCollectionNames,
} from '../../../shared/constants/applicationMongoCollections.js';
import type { DatabaseCleanupCategoryId } from '../../../shared/types/adminDatabaseMaintenance.js';
import { InviteLink } from '../../models/InviteLink.js';

/** Matches scheduled import/backup job cleanup in `cronJobs.ts`. */
export const STALE_JOB_DAYS = 2;

export const KNOWN_COLLECTIONS = new Set<string>(listApplicationMongoCollectionNames());

/** Application MongoDB collection names shown as "Known" in Admin → Database. */
export function listKnownApplicationCollectionNames(): readonly string[] {
  return listApplicationMongoCollectionNames();
}

export const ORPHAN_DELETE_BATCH = 2000;

export interface CategoryDefinition {
  readonly id: DatabaseCleanupCategoryId;
  readonly label: string;
  readonly description: string;
  readonly safeToDelete: boolean;
  readonly count: () => Promise<number>;
  readonly cleanup: () => Promise<number>;
}

export function staleJobCutoff(): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - STALE_JOB_DAYS);
  return cutoff;
}

export async function countOrphansByLookup(
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

export async function deleteOrphansByLookup(
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

export async function countOrphanInviteLinks(): Promise<number> {
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

export async function deleteOrphanInviteLinks(): Promise<number> {
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
