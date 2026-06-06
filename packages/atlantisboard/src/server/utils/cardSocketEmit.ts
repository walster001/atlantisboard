import type { Document } from 'mongoose';
import type { ICard } from '../models/Card.js';
import { emitToBoard } from './socketIO.js';

/** Fan-out full card document after embedded mutations (comments, checklists, attachments, assignees, move). */
export function emitCardUpdatedRealtime(card: Document & ICard): void {
  const boardId = card.boardId.toString();
  const cardId = card._id.toString();
  emitToBoard(boardId, 'card:updated', {
    cardId,
    boardId,
    data: card.toObject(),
    serverTs: Date.now(),
  });
}
