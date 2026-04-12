import { Card, type ICard } from '../models/Card.js';
import { List, type IList } from '../models/List.js';
import { Board, type IBoard } from '../models/Board.js';
import { logger } from '../utils/logger.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { createActivity } from './activityService.js';
import { hasPermission } from '../utils/permissions.js';
import { emitToBoard } from '../utils/socketIO.js';
import { emitCardUpdatedRealtime } from '../utils/cardSocketEmit.js';
import type { Document } from 'mongoose';
import {
  deriveCardDescriptionPreview,
  toCardDetail,
  toCardSummary,
  type CardViewMode,
} from './cardViewService.js';
import type { CardDetailDTO, CardSummaryDTO } from '../../shared/types/viewModels.js';
import { renderCardDescriptionHtml } from '../utils/cardDescriptionHtml.js';
import { CARD_TITLE_MAX_LENGTH } from '../../shared/constants/entityTextLimits.js';

function getBoardListCardLimits(board: Document & IBoard): { max: number; enforce: boolean } {
  const s = board.settings;
  const max =
    typeof s.listMaxCards === 'number' && !Number.isNaN(s.listMaxCards) && s.listMaxCards >= 1
      ? s.listMaxCards
      : 1000;
  const enforce = s.listEnforceMaxCards !== false;
  return { max, enforce };
}

export interface CreateCardInput {
  listId: string;
  boardId: string;
  title: string;
  description?: string | undefined;
  position?: number | undefined;
}

export interface UpdateCardInput {
  title?: string | undefined;
  description?: string | undefined;
  listId?: string | undefined;
  position?: number | undefined;
  color?: string | undefined;
  cover?: string | undefined;
  dueDate?: Date | null | undefined;
  startDate?: Date | undefined;
  completed?: boolean | undefined;
}

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

  // Get max position if not provided
  let position = input.position;
  if (position === undefined) {
    const maxCard = await Card.findOne({ listId: input.listId })
      .sort({ position: -1 })
      .limit(1);
    position = maxCard ? maxCard.position + 1 : 0;
  }

  const descriptionPreviewData = deriveCardDescriptionPreview(input.description);
  const descriptionHtml = renderCardDescriptionHtml(input.description);
  const card = new Card({
    listId: input.listId,
    boardId: input.boardId,
    title: input.title,
    description:
      input.description !== undefined && input.description !== ''
        ? input.description
        : undefined,
    descriptionPreview: descriptionPreviewData.preview,
    descriptionCharCount: descriptionPreviewData.charCount,
    descriptionHtml,
    position,
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

export async function getCardById(
  cardId: string,
  userId: string,
  options?: { view?: CardViewMode }
): Promise<((Document & ICard) | CardDetailDTO) | null> {
  const card = await Card.findById(cardId);
  if (!card) {
    return null;
  }
  const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'cards.view');
  if (!allowed) {
    throw new Error('Insufficient permissions to view card');
  }
  void options;
  return toCardDetail(card);
}

export async function getCardsByList(
  listId: string,
  userId: string,
  options?: { view?: CardViewMode; fields?: string[] }
): Promise<Array<(Document & ICard) | CardSummaryDTO>> {
  const list = await List.findById(listId).select('boardId').lean();
  if (!list) {
    throw new Error('List not found');
  }
  const allowed = await hasPermission({ id: userId }, String(list.boardId), 'cards.view');
  if (!allowed) {
    throw new Error('Insufficient permissions to view cards');
  }
  const cards = await Card.find({ listId }).sort({ position: 1 });
  if (options?.view === 'summary') {
    const summaries = cards.map((card) => toCardSummary(card));
    if (Array.isArray(options.fields) && options.fields.length > 0) {
      return summaries.map((summary) => {
        const selected: Record<string, unknown> = {};
        for (const field of options.fields ?? []) {
          if (field in summary) {
            selected[field] = (summary as unknown as Record<string, unknown>)[field];
          }
        }
        selected.id = summary.id;
        selected.listId = summary.listId;
        selected.boardId = summary.boardId;
        return selected as unknown as CardSummaryDTO;
      });
    }
    return summaries;
  }
  return cards;
}

export async function updateCard(
  cardId: string,
  input: UpdateCardInput,
  userId: string
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
    const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'cards.update');
    if (!allowed) {
      throw new Error('Insufficient permissions to update card');
    }
  }

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
  if (input.startDate !== undefined) card.startDate = input.startDate;
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

export async function moveCard(
  cardId: string,
  targetListId: string,
  position: number,
  userId: string
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

  // Verify target list exists and is in same board
  const targetList = await List.findById(targetListId);
  if (!targetList) {
    throw new Error('Target list not found');
  }

  if (targetList.boardId.toString() !== card.boardId.toString()) {
    throw new Error('Cannot move card to a different board');
  }

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'cards.move');
    if (!allowed) {
      throw new Error('Insufficient permissions to move card');
    }
  }

  const { max, enforce } = getBoardListCardLimits(board);
  if (enforce && card.listId.toString() !== targetListId) {
    const cardCount = await Card.countDocuments({ listId: targetListId });
    if (cardCount >= max) {
      throw new Error(`Target list has reached maximum card limit of ${max}`);
    }
  }

  // Store original listId for audit log
  const originalListId = card.listId.toString();

  // Reorder other cards in target list to make room
  await Card.updateMany(
    {
      listId: targetListId,
      _id: { $ne: cardId },
      position: { $gte: position },
    },
    { $inc: { position: 1 } }
  );

  // Update card position and listId
  card.listId = targetListId as unknown as typeof card.boardId;
  card.position = position;

  await card.save();

  emitCardUpdatedRealtime(card);

  logAuditEvent({
    userId,
    action: 'card.move',
    resourceType: 'card',
    resourceId: cardId,
    metadata: { fromListId: originalListId, toListId: targetListId, position },
    timestamp: new Date(),
  });

  createActivity({
    boardId: card.boardId.toString(),
    cardId: cardId,
    userId,
    type: 'card.moved',
    description: `Card moved to list "${targetList.name}"`,
  });

  return card;
}

export async function reorderCards(
  listId: string,
  cardIds: string[],
  userId: string
): Promise<boolean> {
  // Verify list exists
  const list = await List.findById(listId);
  if (!list) {
    throw new Error('List not found');
  }

  // Check permissions
  const board = await Board.findById(list.boardId);
  if (!board) {
    throw new Error('Board not found');
  }

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, list.boardId.toString(), 'cards.reorder');
    if (!allowed) {
      throw new Error('Insufficient permissions to reorder cards');
    }
  }

  // Update card positions
  await Promise.all(
    cardIds.map((cardId, index) =>
      Card.findByIdAndUpdate(cardId, { position: index, listId })
    )
  );

  emitToBoard(list.boardId.toString(), 'cards:reordered', {
    boardId: list.boardId.toString(),
    listId,
    orderedCardIds: cardIds,
  });

  logAuditEvent({
    userId,
    action: 'card.reorder',
    resourceType: 'list',
    resourceId: listId,
    metadata: { cardIds },
    timestamp: new Date(),
  });

  return true;
}

export async function duplicateCard(
  cardId: string,
  targetListId: string,
  userId: string
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

  // Get position in target list
  const maxCard = await Card.findOne({ listId: targetListId })
    .sort({ position: -1 })
    .limit(1);
  const position = maxCard ? maxCard.position + 1 : 0;

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
    color: sourceCard.color,
    cover: sourceCard.cover,
    labels: sourceCard.labels,
    dueDate: sourceCard.dueDate,
    startDate: sourceCard.startDate,
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

export async function addCardAssignee(
  cardId: string,
  assigneeId: string,
  userId: string
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

  if (!card.assignees.includes(assigneeId as unknown as typeof card.createdBy)) {
    card.assignees.push(assigneeId as unknown as typeof card.createdBy);
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
  userId: string
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

  card.assignees = card.assignees.filter(
    (id) => id.toString() !== assigneeId
  );
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

export async function getBoardKanbanSnapshot(
  boardId: string,
  options?: { listLimit?: number }
): Promise<{ lists: Array<Document & IList>; cardsByList: Record<string, CardSummaryDTO[]> }> {
  const lists = await List.find({ boardId }).sort({ position: 1 });
  const cardsByList: Record<string, CardSummaryDTO[]> = {};
  for (const list of lists) {
    const query = Card.find({ listId: list._id }).sort({ position: 1 });
    if (typeof options?.listLimit === 'number' && options.listLimit > 0) {
      query.limit(options.listLimit);
    }
    const cards = await query;
    cardsByList[list._id.toString()] = cards.map((card) => toCardSummary(card));
  }
  return { lists, cardsByList };
}

export interface AddReminderInput {
  triggerAt: Date;
  repeatFrequency?: string;
}

export async function addCardReminder(
  cardId: string,
  input: AddReminderInput,
  userId: string
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
    const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'cards.reminders.create');
    if (!allowed) {
      throw new Error('Insufficient permissions to add reminders');
    }
  }

  // Check reminder limit (max 3 per card)
  const activeReminders = card.reminders.filter((r) => !r.dismissed);
  if (activeReminders.length >= 3) {
    throw new Error('Maximum of 3 reminders per card');
  }

  // Check if card has due date (required for reminders)
  if (!card.dueDate) {
    throw new Error('Card must have a due date to add reminders');
  }

  const reminderId = crypto.randomUUID();
  const newReminder: {
    id: string;
    triggerAt: Date;
    repeatFrequency?: string;
    sent: boolean;
    dismissed: boolean;
  } = {
    id: reminderId,
    triggerAt: input.triggerAt,
    sent: false,
    dismissed: false,
  };
  if (input.repeatFrequency) {
    newReminder.repeatFrequency = input.repeatFrequency;
  }
  card.reminders.push(newReminder);

  await card.save();

  emitCardUpdatedRealtime(card);

  // Emit Socket.io event for reminder creation
  emitToBoard(card.boardId.toString(), 'reminder:created', {
    cardId,
    reminderId,
    reminder: newReminder,
    boardId: card.boardId.toString(),
  });

  logAuditEvent({
    userId,
    action: 'card.reminder.add',
    resourceType: 'card',
    resourceId: cardId,
    metadata: { reminderId, triggerAt: input.triggerAt },
    timestamp: new Date(),
  });

  return card;
}

export interface UpdateReminderInput {
  triggerAt?: Date;
  repeatFrequency?: string;
}

export async function updateCardReminder(
  cardId: string,
  reminderId: string,
  input: UpdateReminderInput,
  userId: string
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
    const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'cards.reminders.update');
    if (!allowed) {
      throw new Error('Insufficient permissions to update reminders');
    }
  }

  const reminder = card.reminders.find((r) => r.id === reminderId);
  if (!reminder) {
    throw new Error('Reminder not found');
  }

  if (input.triggerAt !== undefined) reminder.triggerAt = input.triggerAt;
  if (input.repeatFrequency !== undefined) reminder.repeatFrequency = input.repeatFrequency;

  await card.save();

  emitCardUpdatedRealtime(card);

  // Emit Socket.io event for reminder update
  emitToBoard(card.boardId.toString(), 'reminder:updated', {
    cardId,
    reminderId,
    reminder,
    boardId: card.boardId.toString(),
  });

  logAuditEvent({
    userId,
    action: 'card.reminder.update',
    resourceType: 'card',
    resourceId: cardId,
    metadata: { reminderId },
    timestamp: new Date(),
  });

  return card;
}

export async function deleteCardReminder(
  cardId: string,
  reminderId: string,
  userId: string
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
    const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'cards.reminders.delete');
    if (!allowed) {
      throw new Error('Insufficient permissions to delete reminders');
    }
  }

  const reminder = card.reminders.find((r) => r.id === reminderId);
  card.reminders = card.reminders.filter((r) => r.id !== reminderId);
  await card.save();

  emitCardUpdatedRealtime(card);

  // Emit Socket.io event for reminder deletion
  if (reminder) {
    emitToBoard(card.boardId.toString(), 'reminder:deleted', {
      cardId,
      reminderId,
      boardId: card.boardId.toString(),
    });
  }

  logAuditEvent({
    userId,
    action: 'card.reminder.delete',
    resourceType: 'card',
    resourceId: cardId,
    metadata: { reminderId },
    timestamp: new Date(),
  });

  return card;
}

export async function dismissCardReminder(
  cardId: string,
  reminderId: string,
  userId: string
): Promise<(Document & ICard) | null> {
  const card = await Card.findById(cardId);
  if (!card) {
    return null;
  }

  const reminder = card.reminders.find((r) => r.id === reminderId);
  if (!reminder) {
    throw new Error('Reminder not found');
  }

  reminder.dismissed = true;
  await card.save();

  emitCardUpdatedRealtime(card);

  // Emit Socket.io event for reminder dismissal
  emitToBoard(card.boardId.toString(), 'reminder:dismissed', {
    cardId,
    reminderId,
    boardId: card.boardId.toString(),
    dismissedBy: userId,
  });

  logAuditEvent({
    userId,
    action: 'card.reminder.dismiss',
    resourceType: 'card',
    resourceId: cardId,
    metadata: { reminderId },
    timestamp: new Date(),
  });

  return card;
}

