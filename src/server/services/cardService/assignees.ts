import { Types, type Document } from 'mongoose';
import { Card, type ICard } from '../../models/Card.js';
import { Board } from '../../models/Board.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { hasPermission } from '../../utils/permissions.js';
import { emitCardUpdatedRealtime } from '../../utils/cardSocketEmit.js';

export async function addCardAssignee(
  cardId: string,
  assigneeId: string,
  userId: string,
): Promise<(Document & ICard) | null> {
  const card = await Card.findById(cardId);
  if (!card) {
    return null;
  }

  // Check permissions
  const board = await Board.findById(card.boardId);
  if (!board) {
    throw new Error('Board not found');
  }

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'cards.assignees.add');
    if (!allowed) {
      throw new Error('Insufficient permissions to assign users');
    }
  }

  const assigneeObjectId = new Types.ObjectId(assigneeId);
  if (!card.assignees.some((id) => id.equals(assigneeObjectId))) {
    card.assignees.push(assigneeObjectId);
    await card.save();
    emitCardUpdatedRealtime(card);
  }

  logAuditEvent({
    userId,
    action: 'card.assignee.add',
    resourceType: 'card',
    resourceId: cardId,
    metadata: { assigneeId },
    timestamp: new Date(),
  });

  return card;
}

export async function removeCardAssignee(
  cardId: string,
  assigneeId: string,
  userId: string,
): Promise<(Document & ICard) | null> {
  const card = await Card.findById(cardId);
  if (!card) {
    return null;
  }

  // Check permissions
  const board = await Board.findById(card.boardId);
  if (!board) {
    throw new Error('Board not found');
  }

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'cards.assignees.remove');
    if (!allowed) {
      throw new Error('Insufficient permissions to remove assignees');
    }
  }

  card.assignees = card.assignees.filter((id) => id.toString() !== assigneeId);
  await card.save();

  emitCardUpdatedRealtime(card);

  logAuditEvent({
    userId,
    action: 'card.assignee.remove',
    resourceType: 'card',
    resourceId: cardId,
    metadata: { assigneeId },
    timestamp: new Date(),
  });

  return card;
}
