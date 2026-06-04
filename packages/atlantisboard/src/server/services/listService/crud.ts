import { List, type IList } from '../../models/List.js';
import { Card } from '../../models/Card.js';
import { Board } from '../../models/Board.js';
import { removeStoredImportInlineObjectsForListIds } from '../importInlineAssetService.js';
import { emitToBoard } from '../../utils/socketIO.js';
import { logger } from '../../utils/logger.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { hasPermission } from '../../utils/permissions.js';
import type { Document } from 'mongoose';
import mongoose from 'mongoose';
import { ForbiddenError, NotFoundError } from '../../../shared/errors/domainErrors.js';
import { compareBoardListOrder } from '../../../shared/utils/listPos.js';
import {
  type CreateListInput,
  type UpdateListInput,
  ensureListsHavePosForBoard,
  spreadListPosForIndex,
  LIST_POS_STEP,
} from './typesAndHelpers.js';

export async function createList(input: CreateListInput, userId: string): Promise<Document & IList> {
  const board = await Board.findById(input.boardId);
  if (!board) {
    throw new NotFoundError('Board not found');
  }

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, input.boardId, 'lists.create');
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions to create list');
    }
  }

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
    throw new ForbiddenError('Insufficient permissions to view list');
  }
  return list;
}

export async function getListsByBoard(boardId: string, userId: string): Promise<(Document & IList)[]> {
  const allowed = await hasPermission({ id: userId }, boardId, 'lists.view');
  if (!allowed) {
    throw new ForbiddenError('Insufficient permissions to view lists');
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

  const board = await Board.findById(list.boardId);
  if (!board) {
    throw new NotFoundError('Board not found');
  }

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, list.boardId.toString(), 'lists.update');
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions to update list');
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
  emitToBoard(list.boardId.toString(), 'list:patched', {
    listId,
    boardId: list.boardId.toString(),
    changedFields: {
      ...(input.name !== undefined ? { name: list.name } : {}),
      ...(input.position !== undefined
        ? {
            position: list.position,
            pos: typeof list.pos === 'number' ? list.pos : undefined,
          }
        : {}),
      ...(input.color !== undefined ? { color: list.color } : {}),
      updatedAt: list.updatedAt,
    },
    removedFields: [],
    serverTs: Date.now(),
    version: 2,
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
    throw new NotFoundError('Board not found');
  }

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, boardId, 'lists.update');
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions to update lists');
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

  const board = await Board.findById(list.boardId);
  if (!board) {
    throw new NotFoundError('Board not found');
  }

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, list.boardId.toString(), 'lists.delete');
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions to delete list');
    }
  }

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
