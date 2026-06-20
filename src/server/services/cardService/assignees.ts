import { Types, type Document } from 'mongoose';
import { Card, type ICard } from '../../models/Card.js';
import { Board } from '../../models/Board.js';
import { User } from '../../models/User.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { recordBoardActivityDeferred } from '../boardActivityTracking.js';
import { hasPermission } from '../../utils/permissions.js';
import { emitCardUpdatedRealtime } from '../../utils/cardSocketEmit.js';
import {
  ForbiddenError,
  NotFoundError,
} from '../../../shared/errors/domainErrors.js';

export async function addCardAssignee(
  cardId: string,
  assigneeId: string,
  userId: string,
): Promise<(Document & ICard) | null> {
  let card = await Card.findById(cardId);
  if (!card) {
    return null;
  }

  // Check permissions
  const board = await Board.findById(card.boardId);
  if (!board) {
    throw new NotFoundError('Board not found');
  }

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'cards.assignees.add');
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions to assign users');
    }
  }

  const assigneeObjectId = new Types.ObjectId(assigneeId);
  if (!card.assignees.some((id) => id.equals(assigneeObjectId))) {
    const updated = await Card.findOneAndUpdate(
      { _id: cardId, assignees: { $ne: assigneeObjectId } },
      { $addToSet: { assignees: assigneeObjectId } },
      { new: true },
    );
    if (updated != null) {
      card = updated;
      emitCardUpdatedRealtime(card);
    }
  }

  logAuditEvent({
    userId,
    action: 'card.assignee.add',
    resourceType: 'card',
    resourceId: cardId,
    metadata: { assigneeId },
    timestamp: new Date(),
  });

  const assigneeUser = await User.findById(assigneeId).select('displayName').lean();
  const assigneeDisplayName = assigneeUser?.displayName ?? 'Unknown user';

  recordBoardActivityDeferred({
    boardId: card.boardId.toString(),
    cardId,
    userId,
    category: 'assignees',
    type: 'card.assignee.added',
    description: `Assigned ${assigneeDisplayName} to "${card.title}"`,
    metadata: {
      entityId: assigneeId,
      assigneeDisplayName,
      cardId,
      cardTitle: card.title,
      entityName: card.title,
    },
    boardSettings: board.settings,
  });

  return card;
}

export async function removeCardAssignee(
  cardId: string,
  assigneeId: string,
  userId: string,
): Promise<(Document & ICard) | null> {
  let card = await Card.findById(cardId);
  if (!card) {
    return null;
  }

  // Check permissions
  const board = await Board.findById(card.boardId);
  if (!board) {
    throw new NotFoundError('Board not found');
  }

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'cards.assignees.remove');
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions to remove assignees');
    }
  }

  const updated = await Card.findOneAndUpdate(
    { _id: cardId },
    {
      $pull: { assignees: new Types.ObjectId(assigneeId) },
      $set: { updatedAt: new Date() },
    },
    { new: true },
  );
  if (updated != null) {
    card = updated;
  }

  emitCardUpdatedRealtime(card);

  logAuditEvent({
    userId,
    action: 'card.assignee.remove',
    resourceType: 'card',
    resourceId: cardId,
    metadata: { assigneeId },
    timestamp: new Date(),
  });

  const assigneeUser = await User.findById(assigneeId).select('displayName').lean();
  const assigneeDisplayName = assigneeUser?.displayName ?? 'Unknown user';

  recordBoardActivityDeferred({
    boardId: card.boardId.toString(),
    cardId,
    userId,
    category: 'assignees',
    type: 'card.assignee.removed',
    description: `Unassigned ${assigneeDisplayName} from "${card.title}"`,
    metadata: {
      entityId: assigneeId,
      assigneeDisplayName,
      cardId,
      cardTitle: card.title,
      entityName: card.title,
    },
    boardSettings: board.settings,
  });

  return card;
}
