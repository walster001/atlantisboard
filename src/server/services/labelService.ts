import { BoardLabel } from '../models/BoardLabel.js';
import { Card } from '../models/Card.js';
import { Board } from '../models/Board.js';
import { assertMongoObjectId } from '../utils/mongoObjectId.js';
import { logger } from '../utils/logger.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { recordBoardActivityDeferred } from './boardActivityTracking.js';
import { hasPermission } from '../utils/permissions.js';
import { emitToBoard } from '../utils/socketIO.js';
import { emitCardUpdatedRealtime } from '../utils/cardSocketEmit.js';
import type { Document } from 'mongoose';
import {
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors/domainErrors.js';

export interface CreateLabelInput {
  boardId: string;
  name: string;
  color: string;
  isPredefined?: boolean;
}

export interface UpdateLabelInput {
  name?: string;
  color?: string;
}

export async function createLabel(input: CreateLabelInput, userId: string): Promise<Document & { boardId: unknown; name: string; color: string; isPredefined: boolean; createdAt: Date; createdBy: unknown }> {
  const board = await Board.findById(input.boardId);
  if (!board) {
    throw new NotFoundError('Board not found');
  }

  // Only admins can create labels
  const allowed = await hasPermission({ id: userId }, input.boardId, 'labels.create');
  if (!allowed) {
    throw new ForbiddenError('Only board admins can create labels');
  }

  const label = new BoardLabel({
    boardId: input.boardId,
    name: input.name,
    color: input.color,
    isPredefined: input.isPredefined || false,
    createdBy: userId,
  });

  await label.save();

  emitToBoard(input.boardId, 'label:created', {
    labelId: label._id.toString(),
    boardId: input.boardId,
    data: label.toObject(),
    serverTs: Date.now(),
  });

  logAuditEvent({
    userId,
    action: 'label.create',
    resourceType: 'label',
    resourceId: label._id.toString(),
    metadata: { boardId: input.boardId },
    timestamp: new Date(),
  });

  recordBoardActivityDeferred({
    boardId: input.boardId,
    userId,
    category: 'labels',
    type: 'label.created',
    description: `Label "${input.name}" created`,
    metadata: { entityId: label._id.toString(), entityName: input.name },
    boardSettings: board.settings,
  });

  logger.info({ labelId: label._id.toString(), boardId: input.boardId }, 'Label created');
  return label;
}

export async function getBoardLabels(
  boardId: string,
  userId: string
): Promise<(Document & { boardId: unknown; name: string; color: string; isPredefined: boolean; createdAt: Date; createdBy: unknown })[]> {
  const allowed = await hasPermission({ id: userId }, boardId, 'labels.view');
  if (!allowed) {
    throw new ForbiddenError('Insufficient permissions to view labels');
  }
  return await BoardLabel.find({ boardId }).sort({ createdAt: -1 }).lean();
}

export async function updateLabel(
  labelId: string,
  input: UpdateLabelInput,
  userId: string
): Promise<(Document & { boardId: unknown; name: string; color: string; isPredefined: boolean; createdAt: Date; createdBy: unknown }) | null> {
  assertMongoObjectId(labelId, 'label id');
  const label = await BoardLabel.findById(labelId);
  if (!label) {
    return null;
  }

  // Only admins can update labels
  const allowed = await hasPermission({ id: userId }, label.boardId.toString(), 'labels.update');
  if (!allowed) {
    throw new ForbiddenError('Only board admins can update labels');
  }

  if (input.name !== undefined) label.name = input.name;
  if (input.color !== undefined) label.color = input.color;

  await label.save();

  emitToBoard(label.boardId.toString(), 'label:updated', {
    labelId,
    boardId: label.boardId.toString(),
    data: label.toObject(),
    serverTs: Date.now(),
  });

  logAuditEvent({
    userId,
    action: 'label.update',
    resourceType: 'label',
    resourceId: labelId,
    metadata: { boardId: label.boardId.toString() },
    timestamp: new Date(),
  });

  recordBoardActivityDeferred({
    boardId: label.boardId.toString(),
    userId,
    category: 'labels',
    type: 'label.updated',
    description: `Label "${label.name}" updated`,
    metadata: { entityId: labelId, entityName: label.name },
  });

  return label;
}

export async function deleteLabel(labelId: string, userId: string): Promise<boolean> {
  assertMongoObjectId(labelId, 'label id');
  const label = await BoardLabel.findById(labelId);
  if (!label) {
    return false;
  }

  // Only admins can delete labels
  const allowed = await hasPermission({ id: userId }, label.boardId.toString(), 'labels.delete');
  if (!allowed) {
    throw new ForbiddenError('Only board admins can delete labels');
  }

  const affectedCards = await Card.find({ 'labels.id': labelId })
    .select('_id')
    .lean();
  const affectedCardIds = affectedCards.map((card) => String(card._id));

  const boardIdStr = label.boardId.toString();
  const labelName = label.name;
  recordBoardActivityDeferred({
    boardId: boardIdStr,
    userId,
    category: 'labels',
    type: 'label.deleted',
    description: `Label "${labelName}" deleted`,
    metadata: { entityId: labelId, entityName: labelName },
  });

  emitToBoard(boardIdStr, 'label:deleted', {
    labelId,
    boardId: boardIdStr,
    serverTs: Date.now(),
  });

  // Remove label from all cards
  await Card.updateMany(
    { 'labels.id': labelId },
    { $pull: { labels: { id: labelId } } }
  );

  await BoardLabel.findByIdAndDelete(labelId);

  logAuditEvent({
    userId,
    action: 'label.delete',
    resourceType: 'label',
    resourceId: labelId,
    metadata: { boardId: label.boardId.toString() },
    timestamp: new Date(),
  });

  if (affectedCardIds.length > 0) {
    emitToBoard(boardIdStr, 'labels:removedBulk', {
      boardId: boardIdStr,
      labelId,
      affectedCardIds,
      affectedCount: affectedCardIds.length,
    });
  }

  return true;
}

export async function assignLabelToCard(cardId: string, labelId: string, userId: string): Promise<(Document & { labels: Array<{ id: string; name: string; color: string }> }) | null> {
  assertMongoObjectId(cardId, 'card id');
  assertMongoObjectId(labelId, 'label id');
  const card = await Card.findById(cardId);
  if (!card) {
    return null;
  }

  const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'cards.update');
  if (!allowed) {
    throw new ForbiddenError('Insufficient permissions to update card');
  }

  const label = await BoardLabel.findById(labelId);
  if (!label) {
    throw new NotFoundError('Label not found');
  }

  // Check if label already assigned
  if (card.labels.some((l) => l.id.toString() === labelId)) {
    return card;
  }

  const updated = await Card.findOneAndUpdate(
    { _id: cardId, 'labels.id': { $ne: labelId } },
    {
      $push: {
        labels: {
          id: labelId,
          name: label.name,
          color: label.color,
        },
      },
    },
    { new: true },
  );
  if (updated != null) {
    emitCardUpdatedRealtime(updated);

    logAuditEvent({
      userId,
      action: 'card.label.assign',
      resourceType: 'card',
      resourceId: cardId,
      metadata: { labelId, boardId: card.boardId.toString() },
      timestamp: new Date(),
    });

    recordBoardActivityDeferred({
      boardId: card.boardId.toString(),
      cardId,
      userId,
      category: 'labels',
      type: 'label.assigned',
      description: `Label "${label.name}" assigned to "${card.title}"`,
      metadata: {
        entityId: labelId,
        entityName: label.name,
        cardId,
        cardTitle: card.title,
      },
    });

    return updated;
  }

  return card;
}

export async function removeLabelFromCard(cardId: string, labelId: string, userId: string): Promise<(Document & { labels: Array<{ id: string; name: string; color: string }> }) | null> {
  assertMongoObjectId(cardId, 'card id');
  assertMongoObjectId(labelId, 'label id');
  const card = await Card.findById(cardId);
  if (!card) {
    return null;
  }

  const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'cards.update');
  if (!allowed) {
    throw new ForbiddenError('Insufficient permissions to update card');
  }

  const updated = await Card.findOneAndUpdate(
    { _id: cardId },
    {
      $pull: { labels: { id: labelId } },
      $set: { updatedAt: new Date() },
    },
    { new: true },
  );
  if (updated == null) {
    return null;
  }

  emitCardUpdatedRealtime(updated);

  logAuditEvent({
    userId,
    action: 'card.label.remove',
    resourceType: 'card',
    resourceId: cardId,
    metadata: { labelId, boardId: card.boardId.toString() },
    timestamp: new Date(),
  });

  recordBoardActivityDeferred({
    boardId: card.boardId.toString(),
    cardId,
    userId,
    category: 'labels',
    type: 'label.removed',
    description: `Label removed from "${card.title}"`,
    metadata: { entityId: labelId, cardId, cardTitle: card.title },
  });

  return updated;
}

