import { Types } from 'mongoose';
import { Board } from '../../models/Board.js';
import type {
  AdminBoardActivityReportRow,
  AdminMemberActivityReportRow,
} from '../../../shared/types/adminReporting.js';
import { queryAdminReportingActivities } from './activityQuery.js';
import { normalizeBoardName } from './pagination.js';

function serializeActivityRow<T extends AdminMemberActivityReportRow | AdminBoardActivityReportRow>(
  doc: {
    readonly _id: Types.ObjectId;
    readonly boardId: Types.ObjectId;
    readonly userId: unknown;
    readonly type: string;
    readonly description: string;
    readonly metadata: Record<string, unknown>;
    readonly createdAt: Date;
  },
  boardName: string,
): T {
  return {
    _id: doc._id.toString(),
    boardId: doc.boardId.toString(),
    boardName,
    type: doc.type,
    description: doc.description,
    metadata: doc.metadata ?? {},
    createdAt: doc.createdAt.toISOString(),
    userId: doc.userId as T['userId'],
  } as T;
}

function parseBoardIdFilter(boardId: string | undefined): Types.ObjectId | undefined {
  if (boardId == null || boardId.trim() === '' || !Types.ObjectId.isValid(boardId.trim())) {
    return undefined;
  }
  return new Types.ObjectId(boardId.trim());
}

export async function listAdminActivityReport<T extends AdminMemberActivityReportRow | AdminBoardActivityReportRow>(params: {
  readonly activityTypes: readonly string[];
  readonly retentionField: 'memberActivityLogRetentionDays' | 'activityLogRetentionDays';
  readonly defaultBoardDays: number;
  readonly defaultPageSize: number;
  readonly maxPageSize: number;
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
  readonly days?: number | undefined;
  readonly boardId?: string | undefined;
}): Promise<{ readonly activities: readonly T[]; readonly nextCursor?: string }> {
  const limit = Math.min(
    Math.max(params.limit ?? params.defaultPageSize, 1),
    params.maxPageSize,
  );
  const boardObjectId = parseBoardIdFilter(params.boardId);

  const docs = await queryAdminReportingActivities({
    activityTypes: [...params.activityTypes],
    retentionField: params.retentionField,
    defaultBoardDays: params.defaultBoardDays,
    limit,
    ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
    ...(params.days !== undefined ? { userFilterDays: params.days } : {}),
    ...(boardObjectId !== undefined ? { boardId: boardObjectId } : {}),
  });

  const page = docs.slice(0, limit);
  const boardIds = [...new Set(page.map((row) => row.boardId.toString()))];
  const boards = await Board.find({ _id: { $in: boardIds } })
    .select('name')
    .lean();
  const boardNameById = new Map<string, string>(
    boards.map((board) => [board._id.toString(), normalizeBoardName(board.name)]),
  );

  const activities = page.map((row) =>
    serializeActivityRow<T>(
      row,
      boardNameById.get(row.boardId.toString()) ?? 'Untitled board',
    ),
  );

  const nextCursor =
    docs.length > limit && page.length > 0
      ? String(page[page.length - 1].createdAt.getTime())
      : undefined;

  return {
    activities,
    ...(nextCursor !== undefined ? { nextCursor } : {}),
  };
}
