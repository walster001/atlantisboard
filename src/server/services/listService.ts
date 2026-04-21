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

  const list = new List({
    boardId: input.boardId,
    name: input.name,
    position,
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
  return await List.find({ boardId }).sort({ position: 1 });
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
  if (input.position !== undefined) list.position = input.position;
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

  // Update positions
  await Promise.all(
    listIds.map((listId, index) => List.findByIdAndUpdate(listId, { position: index }))
  );

  emitToBoard(boardId, 'lists:reordered', {
    boardId,
    orderedListIds: listIds,
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

