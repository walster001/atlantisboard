import { Types } from 'mongoose';
import { Board } from '../../models/Board.js';
import { Workspace } from '../../models/Workspace.js';
import {
  ADMIN_REPORTING_BOARD_LIST_MAX_PAGE_SIZE,
  ADMIN_REPORTING_BOARD_LIST_PAGE_SIZE,
} from '../../../shared/constants/adminReporting.js';
import type {
  AdminBoardListReportResponse,
  AdminBoardListReportRow,
} from '../../../shared/types/adminReporting.js';
import type { AdminReportingBoardOptionsResponse } from '../../../shared/types/adminReporting.js';
import {
  buildCreatedAtCursorFilter,
  computeNextCreatedAtCursor,
  normalizeBoardName,
  resolveReportingPageLimit,
} from './pagination.js';

export async function listAdminReportingBoardOptions(): Promise<AdminReportingBoardOptionsResponse> {
  const boards = await Board.find({})
    .select('name')
    .sort({ name: 1, createdAt: 1 })
    .lean();

  return {
    boards: boards.map((board) => ({
      id: board._id.toString(),
      name: normalizeBoardName(board.name),
    })),
  };
}

function resolveOwnerId(ownerId: unknown): string {
  if (ownerId != null && typeof ownerId === 'object' && '_id' in ownerId) {
    return String((ownerId as { _id: unknown })._id);
  }
  return String(ownerId);
}

function resolveOwnerDisplayName(ownerId: unknown): string | undefined {
  if (ownerId != null && typeof ownerId === 'object' && 'displayName' in ownerId) {
    const name = (ownerId as { displayName?: string }).displayName;
    return typeof name === 'string' && name.trim() !== '' ? name.trim() : undefined;
  }
  return undefined;
}

function serializeBoardRow(
  doc: {
    readonly _id: Types.ObjectId;
    readonly name: string;
    readonly workspaceId?: Types.ObjectId;
    readonly ownerId: unknown;
    readonly members?: readonly unknown[];
    readonly visibility: AdminBoardListReportRow['visibility'];
    readonly position: number;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  },
  workspaceName: string | undefined,
): AdminBoardListReportRow {
  const workspaceId =
    doc.workspaceId instanceof Types.ObjectId ? doc.workspaceId.toString() : undefined;
  const ownerDisplayName = resolveOwnerDisplayName(doc.ownerId);

  const row: AdminBoardListReportRow = {
    _id: doc._id.toString(),
    name: normalizeBoardName(doc.name),
    ownerId: resolveOwnerId(doc.ownerId),
    memberCount: Array.isArray(doc.members) ? doc.members.length : 0,
    visibility: doc.visibility,
    position: doc.position,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };

  let result = row;
  if (ownerDisplayName !== undefined) {
    result = { ...result, ownerDisplayName };
  }
  if (workspaceId !== undefined) {
    result = { ...result, workspaceId };
  }
  if (workspaceName !== undefined) {
    result = { ...result, workspaceName };
  }
  return result;
}

export async function listAdminBoardListReport(options?: {
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
}): Promise<AdminBoardListReportResponse> {
  const limit = resolveReportingPageLimit(
    options?.limit,
    ADMIN_REPORTING_BOARD_LIST_PAGE_SIZE,
    ADMIN_REPORTING_BOARD_LIST_MAX_PAGE_SIZE,
  );
  const createdAt = buildCreatedAtCursorFilter(options?.cursor);

  const docs = await Board.find(createdAt !== undefined ? { createdAt } : {})
    .select('name workspaceId ownerId members visibility position createdAt updatedAt')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .populate('ownerId', 'displayName')
    .lean();

  const page = docs.slice(0, limit);
  const workspaceIds = [
    ...new Set(
      page
        .map((board) =>
          board.workspaceId instanceof Types.ObjectId ? board.workspaceId.toString() : undefined,
        )
        .filter((id): id is string => id != null),
    ),
  ];

  const workspaces =
    workspaceIds.length > 0
      ? await Workspace.find({ _id: { $in: workspaceIds } })
          .select('name')
          .lean()
      : [];

  const workspaceNameById = new Map<string, string>(
    workspaces.map((workspace) => [
      workspace._id.toString(),
      typeof workspace.name === 'string' && workspace.name.trim() !== ''
        ? workspace.name.trim()
        : 'Untitled workspace',
    ]),
  );

  const boards = page.map((row) => {
    const workspaceId =
      row.workspaceId instanceof Types.ObjectId ? row.workspaceId.toString() : undefined;
    return serializeBoardRow(
      row,
      workspaceId !== undefined ? workspaceNameById.get(workspaceId) : undefined,
    );
  });

  const nextCursor = computeNextCreatedAtCursor(docs, limit);

  return {
    boards,
    ...(nextCursor !== undefined ? { nextCursor } : {}),
  };
}
