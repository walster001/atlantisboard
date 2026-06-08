import { Card } from '../models/Card.js';
import { logger } from '../utils/logger.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { recordBoardActivityDeferred } from './boardActivityTracking.js';
import { hasPermission } from '../utils/permissions.js';
import { emitCardUpdatedRealtime } from '../utils/cardSocketEmit.js';
import type { Document } from 'mongoose';
import type { IChecklist, IChecklistItem } from '../models/Card.js';
import {
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors/domainErrors.js';

export interface CreateChecklistInput {
  cardId: string;
  title: string;
}

export interface UpdateChecklistInput {
  title?: string;
}

export interface CreateChecklistItemInput {
  cardId: string;
  checklistId: string;
  text: string;
  sortOrder?: number;
}

export interface UpdateChecklistItemInput {
  text?: string;
  completed?: boolean;
  sortOrder?: number;
}

export async function createChecklist(input: CreateChecklistInput, userId: string): Promise<Document & { checklists: IChecklist[] }> {
  const card = await Card.findById(input.cardId);
  if (!card) {
    throw new NotFoundError('Card not found');
  }

  // Check permissions (viewer cannot edit)
  const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'checklists.create');
  if (!allowed) {
    throw new ForbiddenError('Insufficient permissions to create checklist');
  }

  const checklistId = crypto.randomUUID();
  const checklist: IChecklist = {
    id: checklistId,
    title: input.title,
    items: [],
  };

  card.checklists.push(checklist);
  await card.save();

  emitCardUpdatedRealtime(card);

  logAuditEvent({
    userId,
    action: 'checklist.create',
    resourceType: 'card',
    resourceId: input.cardId,
    metadata: { checklistId, boardId: card.boardId.toString() },
    timestamp: new Date(),
  });

  recordBoardActivityDeferred({
    boardId: card.boardId.toString(),
    cardId: input.cardId,
    userId,
    category: 'checklists',
    type: 'checklist.created',
    description: `Checklist "${input.title}" created`,
    metadata: { entityId: checklistId, entityName: input.title, cardId: input.cardId },
  });

  logger.info({ checklistId, cardId: input.cardId }, 'Checklist created');
  return card;
}

export async function updateChecklist(
  cardId: string,
  checklistId: string,
  input: UpdateChecklistInput,
  userId: string
): Promise<(Document & { checklists: IChecklist[] }) | null> {
  const card = await Card.findById(cardId);
  if (!card) {
    return null;
  }

  // Check permissions
  const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'checklists.update');
  if (!allowed) {
    throw new ForbiddenError('Insufficient permissions to update checklist');
  }

  const checklist = card.checklists.find((c) => c.id === checklistId);
  if (!checklist) {
    return null;
  }

  if (input.title !== undefined) {
    checklist.title = input.title;
  }

  await card.save();

  emitCardUpdatedRealtime(card);

  logAuditEvent({
    userId,
    action: 'checklist.update',
    resourceType: 'card',
    resourceId: cardId,
    metadata: { checklistId, boardId: card.boardId.toString() },
    timestamp: new Date(),
  });

  recordBoardActivityDeferred({
    boardId: card.boardId.toString(),
    cardId,
    userId,
    category: 'checklists',
    type: 'checklist.updated',
    description: `Checklist "${checklist.title}" updated`,
    metadata: { entityId: checklistId, entityName: checklist.title, cardId },
  });

  return card;
}

export async function deleteChecklist(cardId: string, checklistId: string, userId: string): Promise<boolean> {
  const card = await Card.findById(cardId);
  if (!card) {
    return false;
  }

  // Check permissions
  const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'checklists.delete');
  if (!allowed) {
    throw new ForbiddenError('Insufficient permissions to delete checklist');
  }

  const checklist = card.checklists.find((c) => c.id === checklistId);
  const checklistTitle = checklist?.title ?? 'Checklist';
  card.checklists = card.checklists.filter((c) => c.id !== checklistId);
  await card.save();

  emitCardUpdatedRealtime(card);

  logAuditEvent({
    userId,
    action: 'checklist.delete',
    resourceType: 'card',
    resourceId: cardId,
    metadata: { checklistId, boardId: card.boardId.toString() },
    timestamp: new Date(),
  });

  recordBoardActivityDeferred({
    boardId: card.boardId.toString(),
    cardId,
    userId,
    category: 'checklists',
    type: 'checklist.deleted',
    description: `Checklist "${checklistTitle}" deleted`,
    metadata: { entityId: checklistId, entityName: checklistTitle, cardId },
  });

  return true;
}

export async function createChecklistItem(
  input: CreateChecklistItemInput,
  userId: string
): Promise<(Document & { checklists: IChecklist[] }) | null> {
  const card = await Card.findById(input.cardId);
  if (!card) {
    return null;
  }

  // Check permissions
  const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'checklists.items.create');
  if (!allowed) {
    throw new ForbiddenError('Insufficient permissions to create checklist item');
  }

  const checklist = card.checklists.find((c) => c.id === input.checklistId);
  if (!checklist) {
    throw new NotFoundError('Checklist not found');
  }

  const itemId = crypto.randomUUID();
  const maxSortOrder = checklist.items.length > 0
    ? Math.max(...checklist.items.map((i) => i.sortOrder || 0))
    : -1;

  const item: IChecklistItem = {
    id: itemId,
    text: input.text,
    completed: false,
    sortOrder: input.sortOrder !== undefined ? input.sortOrder : maxSortOrder + 1,
  };

  checklist.items.push(item);
  await card.save();

  emitCardUpdatedRealtime(card);

  logAuditEvent({
    userId,
    action: 'checklist.item.create',
    resourceType: 'card',
    resourceId: input.cardId,
    metadata: { checklistId: input.checklistId, itemId, boardId: card.boardId.toString() },
    timestamp: new Date(),
  });

  recordBoardActivityDeferred({
    boardId: card.boardId.toString(),
    cardId: input.cardId,
    userId,
    category: 'checklists',
    type: 'checklist.item.created',
    description: `Checklist item created`,
    metadata: {
      entityId: itemId,
      entityName: input.text,
      cardId: input.cardId,
      cardTitle: card.title,
    },
  });

  return card;
}

export async function updateChecklistItem(
  cardId: string,
  checklistId: string,
  itemId: string,
  input: UpdateChecklistItemInput,
  userId: string
): Promise<(Document & { checklists: IChecklist[] }) | null> {
  const card = await Card.findById(cardId);
  if (!card) {
    return null;
  }

  // Check permissions
  const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'checklists.items.update');
  if (!allowed) {
    throw new ForbiddenError('Insufficient permissions to update checklist item');
  }

  const checklist = card.checklists.find((c) => c.id === checklistId);
  if (!checklist) {
    return null;
  }

  const item = checklist.items.find((i) => i.id === itemId);
  if (!item) {
    return null;
  }

  if (input.text !== undefined) item.text = input.text;
  if (input.completed !== undefined) {
    item.completed = input.completed;
    if (input.completed) {
      item.completedAt = new Date();
    } else {
      delete item.completedAt;
    }
  }
  if (input.sortOrder !== undefined) item.sortOrder = input.sortOrder;

  await card.save();

  emitCardUpdatedRealtime(card);

  logAuditEvent({
    userId,
    action: 'checklist.item.update',
    resourceType: 'card',
    resourceId: cardId,
    metadata: { checklistId, itemId, boardId: card.boardId.toString() },
    timestamp: new Date(),
  });

  recordBoardActivityDeferred({
    boardId: card.boardId.toString(),
    cardId,
    userId,
    category: 'checklists',
    type: 'checklist.item.updated',
    description: `Checklist item updated`,
    metadata: { entityId: itemId, entityName: item.text, cardId, cardTitle: card.title },
  });

  return card;
}

export async function deleteChecklistItem(
  cardId: string,
  checklistId: string,
  itemId: string,
  userId: string
): Promise<boolean> {
  const card = await Card.findById(cardId);
  if (!card) {
    return false;
  }

  // Check permissions
  const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'checklists.items.delete');
  if (!allowed) {
    throw new ForbiddenError('Insufficient permissions to delete checklist item');
  }

  const checklist = card.checklists.find((c) => c.id === checklistId);
  if (!checklist) {
    return false;
  }

  const item = checklist.items.find((i) => i.id === itemId);
  const itemText = item?.text ?? 'Item';
  checklist.items = checklist.items.filter((i) => i.id !== itemId);
  await card.save();

  emitCardUpdatedRealtime(card);

  logAuditEvent({
    userId,
    action: 'checklist.item.delete',
    resourceType: 'card',
    resourceId: cardId,
    metadata: { checklistId, itemId, boardId: card.boardId.toString() },
    timestamp: new Date(),
  });

  recordBoardActivityDeferred({
    boardId: card.boardId.toString(),
    cardId,
    userId,
    category: 'checklists',
    type: 'checklist.item.deleted',
    description: `Checklist item deleted`,
    metadata: { entityId: itemId, entityName: itemText, cardId, cardTitle: card.title },
  });

  return true;
}

