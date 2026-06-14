import { Types, type Document } from 'mongoose';
import { Card, type ICard } from '../../models/Card.js';
import { List } from '../../models/List.js';
import { Board } from '../../models/Board.js';
import { logger } from '../../utils/logger.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { recordBoardActivityDeferred } from '../boardActivityTracking.js';
import { hasPermission } from '../../utils/permissions.js';
import { emitToBoard } from '../../utils/socketIO.js';
import { deriveCardDescriptionPreview } from '../cardViewService.js';
import { renderCardDescriptionHtml } from '../../utils/cardDescriptionHtml.js';
import { removeImportInlineObjectsForCardFields } from '../importInlineAssetService.js';
import { normalizeCardDescriptionAttachmentUrls } from '../../../shared/cardDescriptionAttachmentRefs.js';
import { CARD_POS_STEP, spreadPosForIndex } from '../../../shared/utils/cardListPos.js';
import { ensureCardsHavePosForList } from './positioning.js';
import type { CreateCardInput, UpdateCardInput } from './types.js';
import { cardDateFieldChanged, getBoardListCardLimits } from './types.js';
import { assertListOnBoard } from './listBoardValidation.js';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/domainErrors.js';

export async function createCard(input: CreateCardInput, userId: string): Promise<Document & ICard> {
  const list = await List.findById(input.listId);
  if (!list) {
    throw new NotFoundError('List not found');
  }

  const board = await Board.findById(input.boardId);
  if (!board) {
    throw new NotFoundError('Board not found');
  }

  assertListOnBoard(list.boardId, input.boardId);

  // Check permissions (viewer cannot create)
  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, input.boardId, 'cards.create');
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions to create card');
    }
  }

  const { max, enforce } = getBoardListCardLimits(board);
  if (enforce) {
    const cardCount = await Card.countDocuments({ listId: input.listId });
    if (cardCount >= max) {
      throw new ValidationError(`List has reached maximum card limit of ${max}`);
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

  recordBoardActivityDeferred({
    boardId: input.boardId,
    cardId: card._id.toString(),
    userId,
    category: 'cards',
    type: 'card.created',
    description: `Card "${input.title}" created`,
    metadata: {
      entityId: card._id.toString(),
      entityName: input.title,
      cardTitle: input.title,
      listId: input.listId,
      listName: list.name,
    },
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
    throw new NotFoundError('Board not found');
  }

  const boardIdStr = card.boardId.toString();
  const isBoardOwner = board.ownerId.toString() === userId;

  if (!isBoardOwner) {
    const allowed = await hasPermission({ id: userId }, boardIdStr, 'cards.update');
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions to update card');
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
      throw new ForbiddenError(`Insufficient permissions to edit ${kind} date`);
    }
  };

  await assertDateEditIfChanged('due', card.dueDate, input.dueDate);
  await assertDateEditIfChanged('start', card.startDate, input.startDate);
  await assertDateEditIfChanged('end', card.endDate, input.endDate);

  const prevTitle = card.title;
  const prevDescription = card.description;
  const prevDue = card.dueDate;
  const prevStart = card.startDate;
  const prevEnd = card.endDate;
  const prevCompleted = card.completed;

  if (input.title !== undefined) card.title = input.title;
  if (input.description !== undefined) {
    let normalizedDescription =
      input.description === ''
        ? ''
        : normalizeCardDescriptionAttachmentUrls(input.description);
    card.description = normalizedDescription;
    const descriptionPreviewData = deriveCardDescriptionPreview(normalizedDescription);
    card.descriptionPreview = descriptionPreviewData.preview;
    card.descriptionCharCount = descriptionPreviewData.charCount;
    card.descriptionHtml = renderCardDescriptionHtml(normalizedDescription);
  }
  if (input.listId !== undefined) {
    const targetList = await List.findById(input.listId).select('boardId').lean();
    if (targetList == null) {
      throw new NotFoundError('List not found');
    }
    assertListOnBoard(targetList.boardId, boardIdStr);
    card.listId = new Types.ObjectId(input.listId);
  }
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

  const cardTitle = card.title;
  const boardSettings = board.settings;

  if (input.description !== undefined && input.description !== prevDescription) {
    recordBoardActivityDeferred({
      boardId: boardIdStr,
      cardId,
      userId,
      category: 'cardDescriptions',
      type: 'card.description.updated',
      description: `Updated description on "${cardTitle}"`,
      metadata: { entityId: cardId, entityName: cardTitle },
      boardSettings,
    });
  }

  const dateFieldsChanged =
    (input.dueDate !== undefined && cardDateFieldChanged(prevDue, input.dueDate)) ||
    (input.startDate !== undefined && cardDateFieldChanged(prevStart, input.startDate)) ||
    (input.endDate !== undefined && cardDateFieldChanged(prevEnd, input.endDate)) ||
    (input.completed !== undefined && input.completed !== prevCompleted);

  if (dateFieldsChanged) {
    recordBoardActivityDeferred({
      boardId: boardIdStr,
      cardId,
      userId,
      category: 'dates',
      type: 'card.dates.updated',
      description: `Updated dates on "${cardTitle}"`,
      metadata: {
        entityId: cardId,
        entityName: cardTitle,
        field: 'dates',
      },
      boardSettings,
    });
  }

  const generalUpdated =
    (input.title !== undefined && input.title !== prevTitle) ||
    input.color !== undefined ||
    input.cover !== undefined ||
    input.listId !== undefined ||
    input.position !== undefined;

  if (generalUpdated && input.description === undefined) {
    recordBoardActivityDeferred({
      boardId: boardIdStr,
      cardId,
      userId,
      category: 'cards',
      type: 'card.updated',
      description: `Updated card "${cardTitle}"`,
      metadata: {
        entityId: cardId,
        entityName: cardTitle,
        ...(input.title !== undefined && input.title !== prevTitle
          ? { field: 'title', previous: prevTitle, next: card.title }
          : {}),
      },
      boardSettings,
    });
  }

  emitToBoard(boardIdStr, 'card:updated', {
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
    throw new NotFoundError('Board not found');
  }

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'cards.delete');
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions to delete card');
    }
  }

  const boardIdStr = card.boardId.toString();
  const cardTitle = card.title;
  recordBoardActivityDeferred({
    boardId: boardIdStr,
    cardId,
    userId,
    category: 'cards',
    type: 'card.deleted',
    description: `Deleted card "${cardTitle}"`,
    metadata: { entityId: cardId, entityName: cardTitle },
    boardSettings: board.settings,
  });

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
