import { type Document } from 'mongoose';
import { Card, type ICard } from '../../models/Card.js';
import { Board } from '../../models/Board.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { hasPermission } from '../../utils/permissions.js';
import { emitToBoard } from '../../utils/socketIO.js';
import { emitCardUpdatedRealtime } from '../../utils/cardSocketEmit.js';
import type { AddReminderInput, UpdateReminderInput } from './types.js';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/domainErrors.js';

export async function addCardReminder(
  cardId: string,
  input: AddReminderInput,
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

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'cards.reminders.create');
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions to add reminders');
    }
  }

  // Check reminder limit (max 3 per card)
  const activeReminders = card.reminders.filter((r) => !r.dismissed);
  if (activeReminders.length >= 3) {
    throw new ValidationError('Maximum of 3 reminders per card');
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

export async function updateCardReminder(
  cardId: string,
  reminderId: string,
  input: UpdateReminderInput,
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

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'cards.reminders.update');
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions to update reminders');
    }
  }

  const reminder = card.reminders.find((r) => r.id === reminderId);
  if (!reminder) {
    throw new NotFoundError('Reminder not found');
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

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'cards.reminders.delete');
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions to delete reminders');
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
  userId: string,
): Promise<(Document & ICard) | null> {
  const card = await Card.findById(cardId);
  if (!card) {
    return null;
  }

  const reminder = card.reminders.find((r) => r.id === reminderId);
  if (!reminder) {
    throw new NotFoundError('Reminder not found');
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
