import { List, type IList } from '../models/List.js';
import { Card } from '../models/Card.js';
import { Board } from '../models/Board.js';
import { removeStoredImportInlineObjectsForListIds } from './importInlineAssetService.js';
import { emitToBoard } from '../utils/socketIO.js';
import { logger } from '../utils/logger.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { hasPermission } from '../utils/permissions.js';
import type { Document } from 'mongoose';
import mongoose from 'mongoose';
import {
  LIST_POS_STEP,
  compareBoardListOrder,
  insertListPosBetween,
  listPosGapTooSmall,
  listPosNeedsNormalize,
  spreadListPosForIndex,
} from '../../shared/utils/listPos.js';

export interface CreateListInput {
  boardId: string;
  name: string;
  position?: number | undefined;
}

export interface UpdateListInput {
  name?: string | undefined;
  position?: number | undefined;
  color?: string | undefined;
}

type ListPosLeanRow = { _id: mongoose.Types.ObjectId; pos?: number; position: number };

function sortListRowsByPos(rows: readonly ListPosLeanRow[]): ListPosLeanRow[] {
  return [...rows].sort((a, b) =>
    compareBoardListOrder(
      {
        ...(typeof a.pos === 'number' && Number.isFinite(a.pos) ? { pos: a.pos } : {}),
        position: a.position,
        id: a._id.toString(),
      },
      {
        ...(typeof b.pos === 'number' && Number.isFinite(b.pos) ? { pos: b.pos } : {}),
        position: b.position,
        id: b._id.toString(),
      },
    ),
  );
}

async function ensureListsHavePosForBoard(boardId: string | mongoose.Types.ObjectId): Promise<void> {
  const bid = typeof boardId === 'string' ? boardId : boardId.toString();
  const anyMissing = await List.exists({
    boardId: bid,
    $or: [{ pos: { $exists: false } }, { pos: null }],
  });
  if (!anyMissing) {
    return;
  }
  const lists = await List.find({ boardId: bid }).sort({ position: 1, _id: 1 }).lean();
  await Promise.all(
    lists.map((l, i) =>
      List.findByIdAndUpdate(l._id, { pos: spreadListPosForIndex(i), position: i }),
    ),
  );
}

async function syncBoardListPositionsFromPosOrder(boardId: string | mongoose.Types.ObjectId): Promise<void> {
  const bid = typeof boardId === 'string' ? boardId : boardId.toString();
  const rows = sortListRowsByPos(
    await List.find({ boardId: bid }).select('pos position').lean<ListPosLeanRow[]>(),
  );
  await Promise.all(rows.map((row, i) => List.findByIdAndUpdate(row._id, { position: i })));
}

async function normalizeBoardListPosSpread(boardId: string | mongoose.Types.ObjectId): Promise<{
  orderedListIds: string[];
  orderedPos: number[];
}> {
  const bid = typeof boardId === 'string' ? boardId : boardId.toString();
  const rows = sortListRowsByPos(
    await List.find({ boardId: bid }).select('pos position').lean<ListPosLeanRow[]>(),
  );
  const orderedListIds = rows.map((r) => r._id.toString());
  const orderedPos = rows.map((_, i) => spreadListPosForIndex(i));
  await Promise.all(rows.map((r, i) => List.findByIdAndUpdate(r._id, { pos: orderedPos[i], position: i })));
  return { orderedListIds, orderedPos };
}

export async function createList(input: CreateListInput, userId: string): Promise<Document & IList> {
  const board = await Board.findById(input.boardId);
  if (!board) {
    throw new Error('Board not found');
  }

  // Check permissions (viewer cannot create)
  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, input.boardId, 'lists.create');
    if (!allowed) {
      throw new Error('Insufficient permissions to create list');
    }
  }

  // Get max position if not provided
  let position = input.position;
  if (position === undefined) {
    const maxList = await List.findOne({ boardId: input.boardId })
      .sort({ position: -1 })
      .limit(1);
    position = maxList ? maxList.position + 1 : 0;
  }

  await ensureListsHavePosForBoard(input.boardId);
  const maxPosDoc = await List.findOne({ boardId: input.boardId }).sort({ pos: -1 }).limit(1).lean<{
    pos?: number;
    position: number;
  } | null>();
  const maxPos =
    maxPosDoc != null && typeof maxPosDoc.pos === 'number' && Number.isFinite(maxPosDoc.pos)
      ? maxPosDoc.pos
      : null;
  const nextPos =
    maxPos != null ? maxPos + LIST_POS_STEP : spreadListPosForIndex(Math.max(0, Math.floor(position)));

  const list = new List({
    boardId: input.boardId,
    name: input.name,
    position,
    pos: nextPos,
  });

  await list.save();

  logAuditEvent({
    userId,
    action: 'list.create',
    resourceType: 'list',
    resourceId: list._id.toString(),
    metadata: { boardId: input.boardId },
    timestamp: new Date(),
  });

  logger.info({ listId: list._id.toString(), boardId: input.boardId }, 'List created');

  emitToBoard(input.boardId, 'list:created', {
    listId: list._id.toString(),
    boardId: input.boardId,
    data: list.toObject(),
    serverTs: Date.now(),
  });

  return list;
}

export async function getListById(listId: string, userId: string): Promise<(Document & IList) | null> {
  const list = await List.findById(listId);
  if (!list) {
    return null;
  }
  const allowed = await hasPermission({ id: userId }, list.boardId.toString(), 'lists.view');
  if (!allowed) {
    throw new Error('Insufficient permissions to view list');
  }
  return list;
}

export async function getListsByBoard(boardId: string, userId: string): Promise<(Document & IList)[]> {
  const allowed = await hasPermission({ id: userId }, boardId, 'lists.view');
  if (!allowed) {
    throw new Error('Insufficient permissions to view lists');
  }
  const rows = await List.find({ boardId });
  rows.sort((a, b) =>
    compareBoardListOrder(
      {
        ...(typeof a.pos === 'number' && Number.isFinite(a.pos) ? { pos: a.pos } : {}),
        position: a.position,
        id: a._id.toString(),
      },
      {
        ...(typeof b.pos === 'number' && Number.isFinite(b.pos) ? { pos: b.pos } : {}),
        position: b.position,
        id: b._id.toString(),
      },
    ),
  );
  return rows;
}

export async function updateList(
  listId: string,
  input: UpdateListInput,
  userId: string
): Promise<(Document & IList) | null> {
  const list = await List.findById(listId);
  if (!list) {
    return null;
  }

  // Check permissions
  const board = await Board.findById(list.boardId);
  if (!board) {
    throw new Error('Board not found');
  }

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, list.boardId.toString(), 'lists.update');
    if (!allowed) {
      throw new Error('Insufficient permissions to update list');
    }
  }

  if (input.name !== undefined) list.name = input.name;
  if (input.position !== undefined) {
    const normalizedPosition = Math.max(0, Math.floor(input.position));
    list.position = normalizedPosition;
    list.set('pos', spreadListPosForIndex(normalizedPosition));
  }
  if (input.color !== undefined) {
    const color = input.color.trim();
    list.color = color;
  }

  await list.save();

  logAuditEvent({
    userId,
    action: 'list.update',
    resourceType: 'list',
    resourceId: listId,
    timestamp: new Date(),
  });

  emitToBoard(list.boardId.toString(), 'list:updated', {
    listId,
    boardId: list.boardId.toString(),
    data: list.toObject(),
    serverTs: Date.now(),
  });

  return list;
}

export async function bulkUpdateListColorsForBoard(
  boardId: string,
  colorRaw: string,
  userId: string,
): Promise<{ updatedCount: number }> {
  const board = await Board.findById(boardId);
  if (!board) {
    throw new Error('Board not found');
  }

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, boardId, 'lists.update');
    if (!allowed) {
      throw new Error('Insufficient permissions to update lists');
    }
  }

  const color = colorRaw.trim();
  const updateResult = await List.updateMany({ boardId }, { $set: { color } });
  const modified = updateResult.modifiedCount ?? 0;

  emitToBoard(boardId, 'lists:bulk-color-updated', {
    boardId,
    color,
    serverTs: Date.now(),
  });

  logAuditEvent({
    userId,
    action: 'list.bulk_color',
    resourceType: 'board',
    resourceId: boardId,
    metadata: { modifiedCount: modified },
    timestamp: new Date(),
  });

  return { updatedCount: modified };
}

export async function deleteList(listId: string, userId: string): Promise<boolean> {
  const trimmed = listId.trim();
  if (trimmed === '' || !mongoose.Types.ObjectId.isValid(trimmed)) {
    return false;
  }
  const list = await List.findById(trimmed);
  if (!list) {
    return false;
  }

  // Check permissions (only admin/manager/owner can delete)
  const board = await Board.findById(list.boardId);
  if (!board) {
    throw new Error('Board not found');
  }

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, list.boardId.toString(), 'lists.delete');
    if (!allowed) {
      throw new Error('Insufficient permissions to delete list');
    }
  }

  // Delete all cards in list (clean import-inline icons before dropping card rows)
  await removeStoredImportInlineObjectsForListIds([list._id]);
  await Card.deleteMany({ listId: list._id });

  await List.findByIdAndDelete(trimmed);

  emitToBoard(list.boardId.toString(), 'list:deleted', {
    listId: trimmed,
    boardId: list.boardId.toString(),
  });

  logAuditEvent({
    userId,
    action: 'list.delete',
    resourceType: 'list',
    resourceId: trimmed,
    timestamp: new Date(),
  });

  return true;
}

export async function reorderLists(boardId: string, listIds: string[], userId: string): Promise<boolean> {
  const board = await Board.findById(boardId);
  if (!board) {
    throw new Error('Board not found');
  }

  // Check permissions
  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, boardId, 'lists.reorder');
    if (!allowed) {
      throw new Error('Insufficient permissions to reorder lists');
    }
  }

  // Update positions (legacy bulk reflow path)
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
    throw new Error('Board not found');
  }
  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, list.boardId.toString(), 'lists.reorder');
    if (!allowed) {
      throw new Error('Insufficient permissions to reorder lists');
    }
  }

  const boardId = list.boardId.toString();
  const desiredTargetPosition = Math.max(0, Math.floor(targetPosition));
  let normalized = false;

  await ensureListsHavePosForBoard(boardId);
  const rowNumericPos = (r: ListPosLeanRow): number =>
    typeof r.pos === 'number' && Number.isFinite(r.pos) ? r.pos : spreadListPosForIndex(r.position);

  const loadNeighbors = async (): Promise<ListPosLeanRow[]> => {
    const rows = await List.find({ boardId, _id: { $ne: listId } }).select('pos position').lean<ListPosLeanRow[]>();
    return sortListRowsByPos(rows);
  };

  let neighbors = await loadNeighbors();
  let neighborPos = neighbors.map(rowNumericPos);
  if (listPosNeedsNormalize(neighborPos)) {
    await normalizeBoardListPosSpread(boardId);
    normalized = true;
    neighbors = await loadNeighbors();
    neighborPos = neighbors.map(rowNumericPos);
  }

  let insertIndex = Math.min(desiredTargetPosition, neighbors.length);
  let before = insertIndex > 0 ? neighborPos[insertIndex - 1]! : null;
  let after = insertIndex < neighborPos.length ? neighborPos[insertIndex]! : null;
  let newPos = insertListPosBetween(before, after);
  if (listPosGapTooSmall(before, after)) {
    await normalizeBoardListPosSpread(boardId);
    normalized = true;
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
      normalized = true;
    }
  };
  await maybeRenormalize();

  const refreshed = await List.findById(listId);
  if (refreshed != null) {
    list = refreshed;
  }

  const serverTs = Date.now();
  emitToBoard(boardId, 'list:updated', {
    listId,
    boardId,
    data: list.toObject(),
    serverTs,
  });
  if (normalized) {
    const rows = sortListRowsByPos(
      await List.find({ boardId }).select('_id pos position').lean<ListPosLeanRow[]>(),
    );
    emitToBoard(boardId, 'lists:positions-batch-updated', {
      boardId,
      movedListId: listId,
      position: desiredTargetPosition,
      orderedListIds: rows.map((row) => row._id.toString()),
      orderedPos: rows.map((row) => rowNumericPos(row)),
      serverTs,
    });
  }

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

