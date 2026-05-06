import { type Document } from 'mongoose';
import { Card, type ICard } from '../../models/Card.js';
import { List } from '../../models/List.js';
import { Board } from '../../models/Board.js';
import { logger } from '../../utils/logger.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { createActivity } from '../activityService.js';
import { hasPermission } from '../../utils/permissions.js';
import { emitToBoard } from '../../utils/socketIO.js';
import { deriveCardDescriptionPreview } from '../cardViewService.js';
import { renderCardDescriptionHtml } from '../../utils/cardDescriptionHtml.js';
import { removeImportInlineObjectsForCardFields } from '../importInlineAssetService.js';
import { CARD_POS_STEP, spreadPosForIndex } from '../../../shared/utils/cardListPos.js';
import { ensureCardsHavePosForList } from './positioning.js';
import type { CreateCardInput, UpdateCardInput } from './types.js';
import { cardDateFieldChanged, getBoardListCardLimits } from './types.js';

export async function createCard(input: CreateCardInput, userId: string): Promise<Document & ICard> {
  const list = await List.findById(input.listId);
  if (!list) {
    throw new Error('List not found');
  }

  const board = await Board.findById(input.boardId);
  if (!board) {
    throw new Error('Board not found');
  }

  // Check permissions (viewer cannot create)
  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, input.boardId, 'cards.create');
    if (!allowed) {
      throw new Error('Insufficient permissions to create card');
    }
  }

  const { max, enforce } = getBoardListCardLimits(board);
  if (enforce) {
    const cardCount = await Card.countDocuments({ listId: input.listId });
    if (cardCount >= max) {
      throw new Error(`List has reached maximum card limit of ${max}`);
    }
  }

  await ensureCardsHavePosForList(input.listId);

  let position = input.position;
  if (position === undefined) {
    const count = await Card.countDocuments({ listId: input.listId });
    position = count;
  }

  const maxPosDoc = await Card.findOne({ listId: input.listId }).sort({ pos: -1 }).limit(1).lean<{
    pos?: number;
    position: number;
  } | null>();
  const maxPos =
    maxPosDoc != null && typeof maxPosDoc.pos === 'number' && Number.isFinite(maxPosDoc.pos)
      ? maxPosDoc.pos
      : null;
  const nextPos =
    maxPos != null ? maxPos + CARD_POS_STEP : spreadPosForIndex(Math.max(0, Math.floor(position)));

  const descriptionPreviewData = deriveCardDescriptionPreview(input.description);
  const descriptionHtml = renderCardDescriptionHtml(input.description);
  const card = new Card({
    listId: input.listId,
    boardId: input.boardId,
    title: input.title,
    description: input.description !== undefined && input.description !== '' ? input.description : undefined,
    descriptionPreview: descriptionPreviewData.preview,
    descriptionCharCount: descriptionPreviewData.charCount,
    descriptionHtml,
    position,
    pos: nextPos,
    createdBy: userId,
    completed: false,
    labels: [],
    assignees: [],
    reminders: [],
    attachments: [],
    comments: [],
    checklists: [],
  });

  await card.save();

  logAuditEvent({
    userId,
    action: 'card.create',
    resourceType: 'card',
    resourceId: card._id.toString(),
    metadata: { listId: input.listId, boardId: input.boardId },
    timestamp: new Date(),
  });

  createActivity({
    boardId: input.boardId,
    cardId: card._id.toString(),
    userId,
    type: 'card.created',
    description: `Card "${input.title}" created`,
  });

  logger.info({ cardId: card._id.toString(), listId: input.listId }, 'Card created');

  emitToBoard(input.boardId, 'card:created', {
    cardId: card._id.toString(),
    boardId: input.boardId,
    data: card.toObject(),
    serverTs: Date.now(),
  });

  return card;
}

export async function updateCard(
  cardId: string,
  input: UpdateCardInput,
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

  const boardIdStr = card.boardId.toString();
  const isBoardOwner = board.ownerId.toString() === userId;

  if (!isBoardOwner) {
    const allowed = await hasPermission({ id: userId }, boardIdStr, 'cards.update');
    if (!allowed) {
      throw new Error('Insufficient permissions to update card');
    }
  }

  const assertDateEditIfChanged = async (
    kind: 'start' | 'due' | 'end',
    before: Date | undefined | null,
    after: Date | null | undefined,
  ): Promise<void> => {
    if (!cardDateFieldChanged(before, after)) {
      return;
    }
    if (isBoardOwner) {
      return;
    }
    const key =
      kind === 'start'
        ? 'cards.dates.start.edit'
        : kind === 'due'
          ? 'cards.dates.due.edit'
          : 'cards.dates.end.edit';
    if (!(await hasPermission({ id: userId }, boardIdStr, key))) {
      throw new Error(`Insufficient permissions to edit ${kind} date`);
    }
  };

  await assertDateEditIfChanged('due', card.dueDate, input.dueDate);
  await assertDateEditIfChanged('start', card.startDate, input.startDate);
  await assertDateEditIfChanged('end', card.endDate, input.endDate);

  if (input.title !== undefined) card.title = input.title;
  if (input.description !== undefined) {
    card.description = input.description;
    const descriptionPreviewData = deriveCardDescriptionPreview(input.description);
    card.descriptionPreview = descriptionPreviewData.preview;
    card.descriptionCharCount = descriptionPreviewData.charCount;
    card.descriptionHtml = renderCardDescriptionHtml(input.description);
  }
  if (input.listId !== undefined) card.listId = input.listId as unknown as typeof card.boardId;
  if (input.position !== undefined) card.position = input.position;
  if (input.color !== undefined) card.color = input.color;
  if (input.cover !== undefined) card.cover = input.cover;
  if (input.dueDate !== undefined) {
    if (input.dueDate === null) {
      card.set('dueDate', undefined);
    } else {
      card.dueDate = input.dueDate;
    }
  }
  if (input.startDate !== undefined) {
    if (input.startDate === null) {
      card.set('startDate', undefined);
    } else {
      card.startDate = input.startDate;
    }
  }
  if (input.endDate !== undefined) {
    if (input.endDate === null) {
      card.set('endDate', undefined);
    } else {
      card.endDate = input.endDate;
    }
  }
  if (input.completed !== undefined) {
    card.completed = input.completed;
    if (input.completed) {
      card.completedAt = new Date();
    } else {
      delete card.completedAt;
    }
  }

  await card.save();

  logAuditEvent({
    userId,
    action: 'card.update',
    resourceType: 'card',
    resourceId: cardId,
    timestamp: new Date(),
  });

  emitToBoard(card.boardId.toString(), 'card:updated', {
    cardId,
    boardId: card.boardId.toString(),
    data: card.toObject(),
    serverTs: Date.now(),
  });

  return card;
}

export async function deleteCard(cardId: string, userId: string): Promise<boolean> {
  const card = await Card.findById(cardId);
  if (!card) {
    return false;
  }

  // Check permissions (only admin/manager/owner can delete)
  const board = await Board.findById(card.boardId);
  if (!board) {
    throw new Error('Board not found');
  }

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'cards.delete');
    if (!allowed) {
      throw new Error('Insufficient permissions to delete card');
    }
  }

  const boardIdStr = card.boardId.toString();
  await removeImportInlineObjectsForCardFields(card.description, card.descriptionHtml);
  await Card.findByIdAndDelete(cardId);

  emitToBoard(boardIdStr, 'card:deleted', {
    cardId,
    boardId: boardIdStr,
  });

  logAuditEvent({
    userId,
    action: 'card.delete',
    resourceType: 'card',
    resourceId: cardId,
    timestamp: new Date(),
  });

  return true;
}
