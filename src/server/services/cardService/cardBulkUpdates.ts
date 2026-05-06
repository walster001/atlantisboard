import mongoose from 'mongoose';
import { Card } from '../../models/Card.js';
import { List } from '../../models/List.js';
import { Board } from '../../models/Board.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { hasPermission } from '../../utils/permissions.js';
import { emitToBoard } from '../../utils/socketIO.js';

export async function bulkUpdateCardColorsForBoard(
  boardId: string,
  userId: string,
  input: { color: string; listId?: string | undefined },
): Promise<{ updatedCount: number }> {
  const board = await Board.findById(boardId);
  if (!board) {
    throw new Error('Board not found');
  }

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, boardId, 'cards.update');
    if (!allowed) {
      throw new Error('Insufficient permissions to update cards');
    }
  }

  const color = input.color.trim();
  const filter: { boardId: string; listId?: mongoose.Types.ObjectId } = { boardId };
  if (input.listId != null && input.listId.trim() !== '') {
    const listIdTrim = input.listId.trim();
    if (!mongoose.Types.ObjectId.isValid(listIdTrim)) {
      throw new Error('List not found on board');
    }
    const list = await List.findById(listIdTrim).select('boardId');
    if (list == null || list.boardId.toString() !== boardId) {
      throw new Error('List not found on board');
    }
    filter.listId = new mongoose.Types.ObjectId(listIdTrim);
  }

  const updateResult = await Card.updateMany(filter, { $set: { color } });
  emitToBoard(boardId, 'cards:bulk-color-updated', {
    boardId,
    ...(input.listId != null && input.listId.trim() !== '' ? { listId: input.listId.trim() } : {}),
    color,
    serverTs: Date.now(),
  });

  logAuditEvent({
    userId,
    action: 'card.bulk_color',
    resourceType: 'board',
    resourceId: boardId,
    metadata: { listId: input.listId?.trim() ?? null },
    timestamp: new Date(),
  });

  return { updatedCount: updateResult.modifiedCount ?? 0 };
}
