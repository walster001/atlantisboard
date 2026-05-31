import { Card } from '../models/Card.js';
import { logger } from '../utils/logger.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { hasPermission } from '../utils/permissions.js';
import { emitCardUpdatedRealtime } from '../utils/cardSocketEmit.js';
import type { Document } from 'mongoose';
import { Types } from 'mongoose';
import type { ICardComment } from '../models/Card.js';
import {
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors/domainErrors.js';

export interface CreateCommentInput {
  cardId: string;
  text: string;
}

export interface UpdateCommentInput {
  text: string;
}

export async function createComment(input: CreateCommentInput, userId: string): Promise<Document & { comments: ICardComment[] }> {
  const card = await Card.findById(input.cardId);
  if (!card) {
    throw new NotFoundError('Card not found');
  }

  // Check permissions (viewer cannot comment)
  const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'comments.create');
  if (!allowed) {
    throw new ForbiddenError('Insufficient permissions to create comment');
  }

  const commentId = crypto.randomUUID();
  const comment: ICardComment = {
    id: commentId,
    userId: new Types.ObjectId(userId),
    text: input.text,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  card.comments.push(comment);
  await card.save();

  emitCardUpdatedRealtime(card);

  logAuditEvent({
    userId,
    action: 'comment.create',
    resourceType: 'card',
    resourceId: input.cardId,
    metadata: { commentId, boardId: card.boardId.toString() },
    timestamp: new Date(),
  });

  logger.info({ commentId, cardId: input.cardId }, 'Comment created');
  return card;
}

export async function updateComment(
  cardId: string,
  commentId: string,
  input: UpdateCommentInput,
  userId: string
): Promise<(Document & { comments: ICardComment[] }) | null> {
  const card = await Card.findById(cardId);
  if (!card) {
    return null;
  }

  const comment = card.comments.find((c) => c.id === commentId);
  if (!comment) {
    return null;
  }

  // Only comment author can update
  if (comment.userId.toString() !== userId) {
    throw new ForbiddenError('Insufficient permissions to update comment');
  }

  comment.text = input.text;
  comment.updatedAt = new Date();
  await card.save();

  emitCardUpdatedRealtime(card);

  logAuditEvent({
    userId,
    action: 'comment.update',
    resourceType: 'card',
    resourceId: cardId,
    metadata: { commentId, boardId: card.boardId.toString() },
    timestamp: new Date(),
  });

  return card;
}

export async function deleteComment(cardId: string, commentId: string, userId: string): Promise<boolean> {
  const card = await Card.findById(cardId);
  if (!card) {
    return false;
  }

  const comment = card.comments.find((c) => c.id === commentId);
  if (!comment) {
    return false;
  }

  const isAuthor = comment.userId.toString() === userId;
  if (!isAuthor) {
    const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'comments.delete');
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions to delete comment');
    }
  }

  card.comments = card.comments.filter((c) => c.id !== commentId);
  await card.save();

  emitCardUpdatedRealtime(card);

  logAuditEvent({
    userId,
    action: 'comment.delete',
    resourceType: 'card',
    resourceId: cardId,
    metadata: { commentId, boardId: card.boardId.toString() },
    timestamp: new Date(),
  });

  return true;
}

