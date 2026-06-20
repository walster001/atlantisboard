import type { PipelineStage, Types } from 'mongoose';
import { Activity } from '../../models/Activity.js';
import { Board } from '../../models/Board.js';
import { computeEffectiveActivityCutoffDate } from '../../../shared/adminReportingActivityRetention.js';

type BoardRetentionField = 'memberActivityLogRetentionDays' | 'activityLogRetentionDays';

function parseCursorUpperBound(cursor: string | undefined): Date | undefined {
  if (cursor == null || cursor.trim() === '') {
    return undefined;
  }
  const cursorTs = Number.parseInt(cursor, 10);
  if (!Number.isFinite(cursorTs) || cursorTs <= 0) {
    return undefined;
  }
  return new Date(cursorTs);
}

function buildCreatedAtRange(
  cutoff: Date | undefined,
  cursorUpperBound: Date | undefined,
): { $gte?: Date; $lt?: Date } | undefined {
  if (cutoff !== undefined && cursorUpperBound !== undefined) {
    return { $gte: cutoff, $lt: cursorUpperBound };
  }
  if (cutoff !== undefined) {
    return { $gte: cutoff };
  }
  if (cursorUpperBound !== undefined) {
    return { $lt: cursorUpperBound };
  }
  return undefined;
}

function buildBoardRetentionCutoffMatchStage(params: {
  readonly retentionField: BoardRetentionField;
  readonly userFilterDays: number | undefined;
  readonly defaultBoardDays: number;
}): PipelineStage {
  const { retentionField, userFilterDays, defaultBoardDays } = params;

  return {
    $match: {
      $expr: {
        $let: {
          vars: {
            rawRetention: `$boardDoc.settings.${retentionField}`,
            userCutoff:
              userFilterDays != null && userFilterDays >= 1
                ? { $subtract: ['$$NOW', userFilterDays * 86_400_000] }
                : null,
          },
          in: {
            $let: {
              vars: {
                boardCutoff: {
                  $switch: {
                    branches: [
                      {
                        case: { $eq: ['$$rawRetention', null] },
                        then: null,
                      },
                      {
                        case: {
                          $and: [
                            { $gte: ['$$rawRetention', 1] },
                            { $lte: ['$$rawRetention', 3650] },
                          ],
                        },
                        then: {
                          $subtract: [
                            '$$NOW',
                            { $multiply: ['$$rawRetention', 86_400_000] },
                          ],
                        },
                      },
                    ],
                    default: { $subtract: ['$$NOW', defaultBoardDays * 86_400_000] },
                  },
                },
              },
              in: {
                $cond: {
                  if: {
                    $and: [
                      { $eq: ['$$userCutoff', null] },
                      { $eq: ['$$boardCutoff', null] },
                    ],
                  },
                  then: true,
                  else: {
                    $gte: [
                      '$createdAt',
                      {
                        $max: {
                          $filter: {
                            input: ['$$userCutoff', '$$boardCutoff'],
                            as: 'cutoff',
                            cond: { $ne: ['$$cutoff', null] },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

export async function queryAdminReportingActivities(params: {
  readonly activityTypes: readonly string[];
  readonly retentionField: BoardRetentionField;
  readonly defaultBoardDays: number;
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly userFilterDays?: number | undefined;
  readonly boardId?: Types.ObjectId | undefined;
}): Promise<
  ReadonlyArray<{
    readonly _id: Types.ObjectId;
    readonly boardId: Types.ObjectId;
    readonly userId: unknown;
    readonly type: string;
    readonly description: string;
    readonly metadata: Record<string, unknown>;
    readonly createdAt: Date;
  }>
> {
  const cursorUpperBound = parseCursorUpperBound(params.cursor);

  if (params.boardId !== undefined) {
    const board = await Board.findById(params.boardId)
      .select(`settings.${params.retentionField}`)
      .lean();
    const retentionRaw =
      board?.settings != null
        ? (board.settings as unknown as Record<string, unknown>)[params.retentionField]
        : undefined;
    const cutoff = computeEffectiveActivityCutoffDate(
      retentionRaw,
      params.userFilterDays,
      params.defaultBoardDays,
    );
    const createdAt = buildCreatedAtRange(cutoff, cursorUpperBound);
    const filter: Record<string, unknown> = {
      type: { $in: [...params.activityTypes] },
      boardId: params.boardId,
      ...(createdAt !== undefined ? { createdAt } : {}),
    };

    return Activity.find(filter)
      .sort({ createdAt: -1 })
      .limit(params.limit + 1)
      .populate('userId', 'displayName email profilePicture')
      .lean();
  }

  const baseMatch: Record<string, unknown> = {
    type: { $in: [...params.activityTypes] },
    ...(cursorUpperBound !== undefined ? { createdAt: { $lt: cursorUpperBound } } : {}),
  };

  const pipeline: PipelineStage[] = [
    { $match: baseMatch },
    {
      $lookup: {
        from: Board.collection.name,
        localField: 'boardId',
        foreignField: '_id',
        as: 'boardDoc',
        pipeline: [{ $project: { [`settings.${params.retentionField}`]: 1 } }],
      },
    },
    { $unwind: { path: '$boardDoc', preserveNullAndEmptyArrays: false } },
    buildBoardRetentionCutoffMatchStage({
      retentionField: params.retentionField,
      userFilterDays: params.userFilterDays,
      defaultBoardDays: params.defaultBoardDays,
    }),
    { $sort: { createdAt: -1 } },
    { $limit: params.limit + 1 },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'userDoc',
        pipeline: [{ $project: { displayName: 1, email: 1, profilePicture: 1 } }],
      },
    },
    {
      $addFields: {
        userId: {
          $let: {
            vars: { user: { $arrayElemAt: ['$userDoc', 0] } },
            in: {
              _id: '$$user._id',
              displayName: '$$user.displayName',
              email: '$$user.email',
              profilePicture: '$$user.profilePicture',
            },
          },
        },
      },
    },
    {
      $project: {
        boardDoc: 0,
        userDoc: 0,
      },
    },
  ];

  return Activity.aggregate(pipeline);
}
