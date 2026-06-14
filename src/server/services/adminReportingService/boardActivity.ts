import { Types } from 'mongoose';
import { Board } from '../../models/Board.js';
import {
  ADMIN_REPORTING_BOARD_ACTIVITY_MAX_PAGE_SIZE,
  ADMIN_REPORTING_BOARD_ACTIVITY_PAGE_SIZE,
} from '../../../shared/constants/adminReporting.js';
import {
  BOARD_CONTENT_ACTIVITY_TYPES,
  BOARD_CONTENT_DEFAULT_RETENTION_DAYS,
} from '../../../shared/constants/boardContentActivities.js';
import type {
  AdminBoardActivityReportResponse,
  AdminBoardActivityReportRow,
} from '../../../shared/types/adminReporting.js';
import { queryAdminReportingActivities } from './activityQuery.js';

function resolveLimit(limit: number | undefined): number {
  const raw = limit ?? ADMIN_REPORTING_BOARD_ACTIVITY_PAGE_SIZE;
  return Math.min(
    Math.max(raw, 1),
    ADMIN_REPORTING_BOARD_ACTIVITY_MAX_PAGE_SIZE,
  );
}

function serializeActivityRow(
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
): AdminBoardActivityReportRow {
  return {
    _id: doc._id.toString(),
    boardId: doc.boardId.toString(),
    boardName,
    type: doc.type,
    description: doc.description,
    metadata: doc.metadata ?? {},
    createdAt: doc.createdAt.toISOString(),
    userId: doc.userId as AdminBoardActivityReportRow['userId'],
  };
}

function parseBoardIdFilter(boardId: string | undefined): Types.ObjectId | undefined {
  if (boardId == null || boardId.trim() === '' || !Types.ObjectId.isValid(boardId.trim())) {
    return undefined;
  }
  return new Types.ObjectId(boardId.trim());
}

export async function listAdminBoardActivityReport(options?: {
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
  readonly days?: number | undefined;
  readonly boardId?: string | undefined;
}): Promise<AdminBoardActivityReportResponse> {
  const limit = resolveLimit(options?.limit);
  const boardObjectId = parseBoardIdFilter(options?.boardId);

  const docs = await queryAdminReportingActivities({
    activityTypes: [...BOARD_CONTENT_ACTIVITY_TYPES],
    retentionField: 'activityLogRetentionDays',
    defaultBoardDays: BOARD_CONTENT_DEFAULT_RETENTION_DAYS,
    limit,
    ...(options?.cursor !== undefined ? { cursor: options.cursor } : {}),
    ...(options?.days !== undefined ? { userFilterDays: options.days } : {}),
    ...(boardObjectId !== undefined ? { boardId: boardObjectId } : {}),
  });

  const page = docs.slice(0, limit);
  const boardIds = [...new Set(page.map((row) => row.boardId.toString()))];
  const boards = await Board.find({ _id: { $in: boardIds } })
    .select('name')
    .lean();
  const boardNameById = new Map<string, string>(
    boards.map((board) => [
      board._id.toString(),
      typeof board.name === 'string' && board.name.trim() !== '' ? board.name.trim() : 'Untitled board',
    ]),
  );

  const activities = page.map((row) =>
    serializeActivityRow(
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
