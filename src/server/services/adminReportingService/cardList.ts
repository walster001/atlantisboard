import { Types } from 'mongoose';
import { Board } from '../../models/Board.js';
import { Card } from '../../models/Card.js';
import { List } from '../../models/List.js';
import {
  ADMIN_REPORTING_CARD_LIST_MAX_PAGE_SIZE,
  ADMIN_REPORTING_CARD_LIST_PAGE_SIZE,
} from '../../../shared/constants/adminReporting.js';
import type {
  AdminCardListReportResponse,
  AdminCardListReportRow,
} from '../../../shared/types/adminReporting.js';
import {
  buildCreatedAtCursorFilter,
  computeNextCreatedAtCursor,
  normalizeBoardName,
  normalizeListName,
  optionalIsoDate,
  resolveReportingPageLimit,
} from './pagination.js';

const CARD_LIST_PROJECTION =
  '_id boardId listId title position pos dueDate startDate endDate completed completedAt createdAt updatedAt createdBy assignees labels';

function serializeAssigneeIds(assignees: readonly unknown[] | undefined): readonly string[] {
  if (!Array.isArray(assignees)) {
    return [];
  }
  return assignees
    .map((assignee) => {
      if (assignee instanceof Types.ObjectId) {
        return assignee.toString();
      }
      if (assignee != null && typeof assignee === 'object' && '_id' in assignee) {
        return String((assignee as { _id: unknown })._id);
      }
      return typeof assignee === 'string' ? assignee : undefined;
    })
    .filter((id): id is string => id != null && id.trim() !== '');
}

function serializeCardRow(
  doc: {
    readonly _id: Types.ObjectId;
    readonly boardId: Types.ObjectId;
    readonly listId: Types.ObjectId;
    readonly title: string;
    readonly position: number;
    readonly pos?: number;
    readonly dueDate?: Date;
    readonly startDate?: Date;
    readonly endDate?: Date;
    readonly completed: boolean;
    readonly completedAt?: Date;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly createdBy: Types.ObjectId;
    readonly assignees?: readonly unknown[];
    readonly labels?: readonly unknown[];
  },
  boardName: string,
  listName: string,
): AdminCardListReportRow {
  const assigneeIds = serializeAssigneeIds(doc.assignees);
  const dueDate = optionalIsoDate(doc.dueDate);
  const startDate = optionalIsoDate(doc.startDate);
  const endDate = optionalIsoDate(doc.endDate);
  const completedAt = optionalIsoDate(doc.completedAt);

  return {
    _id: doc._id.toString(),
    boardId: doc.boardId.toString(),
    boardName,
    listId: doc.listId.toString(),
    listName,
    title: typeof doc.title === 'string' && doc.title.trim() !== '' ? doc.title.trim() : 'Untitled card',
    position: doc.position,
    ...(doc.pos !== undefined ? { pos: doc.pos } : {}),
    ...(dueDate !== undefined ? { dueDate } : {}),
    ...(startDate !== undefined ? { startDate } : {}),
    ...(endDate !== undefined ? { endDate } : {}),
    completed: doc.completed === true,
    ...(completedAt !== undefined ? { completedAt } : {}),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    createdBy: doc.createdBy.toString(),
    assigneeCount: assigneeIds.length,
    assigneeIds,
    labelCount: Array.isArray(doc.labels) ? doc.labels.length : 0,
  };
}

export async function listAdminCardListReport(options?: {
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
}): Promise<AdminCardListReportResponse> {
  const limit = resolveReportingPageLimit(
    options?.limit,
    ADMIN_REPORTING_CARD_LIST_PAGE_SIZE,
    ADMIN_REPORTING_CARD_LIST_MAX_PAGE_SIZE,
  );
  const createdAt = buildCreatedAtCursorFilter(options?.cursor);

  const docs = await Card.find(createdAt !== undefined ? { createdAt } : {})
    .select(CARD_LIST_PROJECTION)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const page = docs.slice(0, limit);
  const boardIds = [...new Set(page.map((row) => row.boardId.toString()))];
  const boards =
    boardIds.length > 0
      ? await Board.find({ _id: { $in: boardIds } })
          .select('name')
          .lean()
      : [];

  const boardNameById = new Map<string, string>(
    boards.map((board) => [board._id.toString(), normalizeBoardName(board.name)]),
  );

  const listIds = [...new Set(page.map((row) => row.listId.toString()))];
  const lists =
    listIds.length > 0
      ? await List.find({ _id: { $in: listIds } })
          .select('name')
          .lean()
      : [];
  const listNameById = new Map<string, string>(
    lists.map((list) => [list._id.toString(), normalizeListName(list.name)]),
  );

  const cards = page.map((row) =>
    serializeCardRow(
      row,
      boardNameById.get(row.boardId.toString()) ?? 'Untitled board',
      listNameById.get(row.listId.toString()) ?? 'Untitled list',
    ),
  );

  const nextCursor = computeNextCreatedAtCursor(docs, limit);

  return {
    cards,
    ...(nextCursor !== undefined ? { nextCursor } : {}),
  };
}
