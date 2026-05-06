import mongoose, { type Document } from 'mongoose';
import { Board, type IBoard } from '../../models/Board.js';
import { hasPermission } from '../../utils/permissions.js';
import { logger } from '../../utils/logger.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { emitToBoard, emitToUser, emitToWorkspace } from '../../utils/socketIO.js';
import {
  getUserWorkspaces,
  getWorkspaceOwnerAndMemberUserIds,
} from '../workspaceService.js';
import { getUserBoards } from './queries.js';
import { workspaceListEntryId } from './helpers.js';
import { ensureLegacyBoardPositions, nextHomeBoardPositionsSequence } from './shared.js';

async function listBoardsInHomeScopeForReorder(
  userId: string,
  workspaceId: string,
): Promise<(Document & IBoard)[]> {
  const visibleWorkspaces = await getUserWorkspaces(userId, { view: 'detail' });
  const widTrimmed = workspaceId.trim();
  if (!visibleWorkspaces.some((ws) => workspaceListEntryId(ws) === widTrimmed)) {
    return [];
  }
  const allVisible = await getUserBoards(userId, undefined, { view: 'detail' });
  const allVisibleDocs = allVisible.filter(
    (board): board is Document & IBoard => '_id' in board,
  );
  const scoped = allVisibleDocs.filter(
    (board) => board.workspaceId != null && board.workspaceId.toString() === widTrimmed,
  );
  scoped.sort((a, b) => {
    const ap = typeof a.position === 'number' && !Number.isNaN(a.position) ? a.position : 0;
    const bp = typeof b.position === 'number' && !Number.isNaN(b.position) ? b.position : 0;
    if (ap !== bp) {
      return ap - bp;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return scoped;
}

/** Home reorder mutates `position` for every visible board in the row — align with client `canReorderAllBoardsInScope`. */
async function userCanEditBoardDoc(userId: string, board: Document & IBoard): Promise<boolean> {
  if (board.ownerId.toString() === userId) {
    return true;
  }
  const boardId = board._id.toString();
  const user = { id: userId };
  return (
    (await hasPermission(user, boardId, 'boards.reorder_in_home')) ||
    (await hasPermission(user, boardId, 'boards.update'))
  );
}

/**
 * Persist home-page order within one workspace (boards the user can see in that workspace).
 * Caller must send every board id in that scope, in the new order.
 */
export async function reorderBoardsInHomeScope(
  userId: string,
  workspaceId: string,
  orderedBoardIds: readonly string[],
): Promise<void> {
  await ensureLegacyBoardPositions();

  const wid = workspaceId.trim();
  const normalizedIds = orderedBoardIds.map((id) => id.trim()).filter((id) => id.length > 0);

  const boardsInScope = await listBoardsInHomeScopeForReorder(userId, wid);
  const expectedIds = new Set(boardsInScope.map((b) => b._id.toString()));
  const got = new Set(normalizedIds);

  if (expectedIds.size !== got.size || !normalizedIds.every((id) => expectedIds.has(id))) {
    throw new Error('Invalid board order for this workspace');
  }

  for (const b of boardsInScope) {
    if (!(await userCanEditBoardDoc(userId, b))) {
      throw new Error('Insufficient permissions to reorder boards in this workspace');
    }
  }

  const bulk = normalizedIds.map((id, index) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(id) },
      update: { $set: { position: index } },
    },
  }));

  if (bulk.length > 0) {
    await Board.bulkWrite(bulk);
  }

  logger.info(
    { userId, workspaceId: wid, boardCount: bulk.length },
    'Workspace home row: board position indices saved (0..n-1 on each Board.position)',
  );

  const updated = await Board.find({
    _id: { $in: normalizedIds.map((id) => new mongoose.Types.ObjectId(id)) },
  });
  const serverTs = Date.now();
  const sequence = nextHomeBoardPositionsSequence();
  const positionsPayload = {
    workspaceId: wid,
    orderedBoardIds: [...normalizedIds],
    serverTs,
    sequence,
  };
  emitToWorkspace(wid, 'boards:positionsSynced', positionsPayload);
  const notifyUserIds = new Set<string>();
  for (const b of updated) {
    notifyUserIds.add(b.ownerId.toString());
    for (const m of b.members) {
      notifyUserIds.add(m.userId.toString());
    }
  }
  const workspaceAudience = await getWorkspaceOwnerAndMemberUserIds(wid);
  for (const uid of workspaceAudience) {
    notifyUserIds.add(uid);
  }
  for (const id of normalizedIds) {
    emitToBoard(id, 'boards:positionsSynced', positionsPayload);
  }
  for (const uid of notifyUserIds) {
    emitToUser(uid, 'boards:positionsSynced', positionsPayload);
  }

  logAuditEvent({
    userId,
    action: 'board.reorder.home',
    resourceType: 'board',
    resourceId: normalizedIds[0] ?? 'batch',
    metadata: { workspaceId: wid, count: bulk.length },
    timestamp: new Date(),
  });
}
