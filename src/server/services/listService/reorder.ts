import { List, type IList } from '../../models/List.js';
import { Board } from '../../models/Board.js';
import { emitToBoard } from '../../utils/socketIO.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { hasPermission } from '../../utils/permissions.js';
import type { Document } from 'mongoose';
import { ForbiddenError, NotFoundError } from '../../../shared/errors/domainErrors.js';
import {
  ensureListsHavePosForBoard,
  insertListPosBetween,
  listPosGapTooSmall,
  listPosNeedsNormalize,
  normalizeBoardListPosSpread,
  rowNumericPos,
  sortListRowsByPos,
  spreadListPosForIndex,
  syncBoardListPositionsFromPosOrder,
  type ListPosLeanRow,
} from './typesAndHelpers.js';

export async function reorderLists(boardId: string, listIds: string[], userId: string): Promise<boolean> {
  const board = await Board.findById(boardId);
  if (!board) {
    throw new NotFoundError('Board not found');
  }

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, boardId, 'lists.reorder');
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions to reorder lists');
    }
  }

  await ensureListsHavePosForBoard(boardId);
  const orderedPos = listIds.map((_, index) => spreadListPosForIndex(index));
  await Promise.all(
    listIds.map((listId, index) =>
      List.findByIdAndUpdate(listId, { position: index, pos: orderedPos[index] }),
    )
  );

  emitToBoard(boardId, 'lists:reordered', {
    boardId,
    orderedListIds: listIds,
    orderedPos,
    serverTs: Date.now(),
  });

  logAuditEvent({
    userId,
    action: 'list.reorder',
    resourceType: 'board',
    resourceId: boardId,
    metadata: { listIds },
    timestamp: new Date(),
  });

  return true;
}

export async function moveList(
  listId: string,
  targetPosition: number,
  userId: string,
): Promise<(Document & IList) | null> {
  let list = await List.findById(listId);
  if (!list) {
    return null;
  }
  const board = await Board.findById(list.boardId);
  if (!board) {
    throw new NotFoundError('Board not found');
  }
  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, list.boardId.toString(), 'lists.reorder');
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions to reorder lists');
    }
  }

  const boardId = list.boardId.toString();
  const desiredTargetPosition = Math.max(0, Math.floor(targetPosition));

  await ensureListsHavePosForBoard(boardId);

  const loadNeighbors = async (): Promise<ListPosLeanRow[]> => {
    const rows = await List.find({ boardId, _id: { $ne: listId } }).select('pos position').lean<ListPosLeanRow[]>();
    return sortListRowsByPos(rows);
  };

  let neighbors = await loadNeighbors();
  let neighborPos = neighbors.map(rowNumericPos);
  if (listPosNeedsNormalize(neighborPos)) {
    await normalizeBoardListPosSpread(boardId);
    neighbors = await loadNeighbors();
    neighborPos = neighbors.map(rowNumericPos);
  }

  let insertIndex = Math.min(desiredTargetPosition, neighbors.length);
  let before = insertIndex > 0 ? neighborPos[insertIndex - 1]! : null;
  let after = insertIndex < neighborPos.length ? neighborPos[insertIndex]! : null;
  let newPos = insertListPosBetween(before, after);
  if (listPosGapTooSmall(before, after)) {
    await normalizeBoardListPosSpread(boardId);
    neighbors = await loadNeighbors();
    neighborPos = neighbors.map(rowNumericPos);
    insertIndex = Math.min(desiredTargetPosition, neighbors.length);
    before = insertIndex > 0 ? neighborPos[insertIndex - 1]! : null;
    after = insertIndex < neighborPos.length ? neighborPos[insertIndex]! : null;
    newPos = insertListPosBetween(before, after);
  }

  list.set('pos', newPos);
  list.markModified('pos');
  await list.save();
  await syncBoardListPositionsFromPosOrder(boardId);

  const maybeRenormalize = async (): Promise<void> => {
    const rows = sortListRowsByPos(
      await List.find({ boardId }).select('pos position').lean<ListPosLeanRow[]>(),
    );
    const pl = rows.map(rowNumericPos);
    if (pl.length >= 2 && listPosNeedsNormalize(pl)) {
      await normalizeBoardListPosSpread(boardId);
    }
  };
  await maybeRenormalize();

  const refreshed = await List.findById(listId);
  if (refreshed != null) {
    list = refreshed;
  }

  const finalRows = sortListRowsByPos(
    await List.find({ boardId }).select('_id pos position').lean<ListPosLeanRow[]>(),
  );
  emitToBoard(boardId, 'lists:positions-batch-updated', {
    boardId,
    movedListId: listId,
    position: desiredTargetPosition,
    orderedListIds: finalRows.map((row) => row._id.toString()),
    orderedPos: finalRows.map((row) => rowNumericPos(row)),
    serverTs: Date.now(),
  });

  logAuditEvent({
    userId,
    action: 'list.move',
    resourceType: 'list',
    resourceId: listId,
    metadata: { boardId, position: desiredTargetPosition },
    timestamp: new Date(),
  });

  return list;
}
