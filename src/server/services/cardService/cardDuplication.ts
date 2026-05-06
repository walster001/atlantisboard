import { type Document } from 'mongoose';
import { Card, type ICard } from '../../models/Card.js';
import { List } from '../../models/List.js';
import { Board } from '../../models/Board.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { createActivity } from '../activityService.js';
import { hasPermission } from '../../utils/permissions.js';
import { emitToBoard } from '../../utils/socketIO.js';
import { CARD_TITLE_MAX_LENGTH } from '../../../shared/constants/entityTextLimits.js';
import { CARD_POS_STEP, spreadPosForIndex } from '../../../shared/utils/cardListPos.js';
import { ensureCardsHavePosForList } from './positioning.js';
import { getBoardListCardLimits } from './types.js';

export async function duplicateCard(
  cardId: string,
  targetListId: string,
  userId: string,
): Promise<(Document & ICard) | null> {
  const sourceCard = await Card.findById(cardId);
  if (!sourceCard) {
    return null;
  }

  // Check permissions
  const board = await Board.findById(sourceCard.boardId);
  if (!board) {
    throw new Error('Board not found');
  }

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, sourceCard.boardId.toString(), 'cards.duplicate');
    if (!allowed) {
      throw new Error('Insufficient permissions to duplicate card');
    }
  }

  // Verify target list exists
  const targetList = await List.findById(targetListId);
  if (!targetList) {
    throw new Error('Target list not found');
  }

  const { max, enforce } = getBoardListCardLimits(board);
  if (enforce) {
    const cardCount = await Card.countDocuments({ listId: targetListId });
    if (cardCount >= max) {
      throw new Error(`Target list has reached maximum card limit of ${max}`);
    }
  }

  await ensureCardsHavePosForList(targetListId);
  const count = await Card.countDocuments({ listId: targetListId });
  const position = count;
  const maxPosDoc = await Card.findOne({ listId: targetListId }).sort({ pos: -1 }).limit(1).lean<{
    pos?: number;
    position: number;
  } | null>();
  const maxPos =
    maxPosDoc != null && typeof maxPosDoc.pos === 'number' && Number.isFinite(maxPosDoc.pos)
      ? maxPosDoc.pos
      : null;
  const nextPos = maxPos != null ? maxPos + CARD_POS_STEP : spreadPosForIndex(Math.max(0, position));

  // Create duplicate
  const duplicate = new Card({
    listId: targetListId,
    boardId: sourceCard.boardId,
    title: `${sourceCard.title} (Copy)`.slice(0, CARD_TITLE_MAX_LENGTH),
    description: sourceCard.description,
    descriptionHtml: sourceCard.descriptionHtml,
    descriptionPreview: sourceCard.descriptionPreview,
    descriptionCharCount: sourceCard.descriptionCharCount,
    position,
    pos: nextPos,
    color: sourceCard.color,
    cover: sourceCard.cover,
    labels: sourceCard.labels,
    dueDate: sourceCard.dueDate,
    startDate: sourceCard.startDate,
    endDate: sourceCard.endDate,
    completed: false,
    createdBy: userId,
    assignees: sourceCard.assignees,
    reminders: [], // Don't duplicate reminders
    attachments: [], // Don't duplicate attachments
    comments: [], // Don't duplicate comments
    checklists: sourceCard.checklists.map((checklist) => ({
      ...checklist,
      items: checklist.items.map((item) => ({
        ...item,
        completed: false, // Reset completion status
      })),
    })),
  });

  await duplicate.save();

  // Emit Socket.io event for card duplication
  emitToBoard(sourceCard.boardId.toString(), 'card:duplicated', {
    originalCardId: cardId,
    duplicatedCardId: duplicate._id.toString(),
    targetListId,
    boardId: sourceCard.boardId.toString(),
    data: duplicate.toObject(),
    serverTs: Date.now(),
  });

  logAuditEvent({
    userId,
    action: 'card.duplicate',
    resourceType: 'card',
    resourceId: cardId,
    metadata: { duplicatedCardId: duplicate._id.toString(), targetListId },
    timestamp: new Date(),
  });

  createActivity({
    boardId: sourceCard.boardId.toString(),
    cardId: duplicate._id.toString(),
    userId,
    type: 'card.created',
    description: `Card duplicated from "${sourceCard.title}"`,
  });

  return duplicate;
}
