import type { Document } from 'mongoose';
import type { ICard } from '../../models/Card.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { recordBoardActivityDeferred } from '../boardActivityTracking.js';
import { emitToBoard } from '../../utils/socketIO.js';
import type { SourceCardForDuplicate } from './cardDuplicationTypes.js';

export function emitDuplicationRealtime(args: {
  readonly created: readonly (Document & ICard)[];
  readonly sourceCards: readonly SourceCardForDuplicate[];
  readonly targetListId: string;
  readonly targetBoardId: string;
  readonly sourceBoardIdForSocket: string;
  readonly orderedCardIds: readonly string[];
  readonly orderedPos: readonly number[];
}): void {
  const { created, sourceCards, targetListId, targetBoardId, sourceBoardIdForSocket } = args;
  const serverTs = Date.now();
  const emitBoardIds =
    sourceBoardIdForSocket === targetBoardId
      ? [targetBoardId]
      : [sourceBoardIdForSocket, targetBoardId];

  for (let i = 0; i < created.length; i += 1) {
    const refreshed = created[i];
    const source = sourceCards[i];
    if (refreshed == null || source == null) {
      continue;
    }
    const originalCardId =
      typeof source._id === 'string' ? source._id : source._id.toString();
    for (const emitBoardId of emitBoardIds) {
      emitToBoard(emitBoardId, 'card:duplicated', {
        originalCardId,
        duplicatedCardId: refreshed._id.toString(),
        targetListId,
        boardId: targetBoardId,
        data: refreshed.toObject(),
        serverTs,
      });
    }
  }

  emitToBoard(targetBoardId, 'cards:positions-batch-updated', {
    boardId: targetBoardId,
    fromListId: sourceCards[0]?.listId != null ? String(sourceCards[0].listId) : targetListId,
    toListId: targetListId,
    movedCardId: created[created.length - 1]?._id.toString() ?? '',
    position: 0,
    lists: [
      {
        listId: targetListId,
        orderedCardIds: args.orderedCardIds,
        orderedPos: args.orderedPos,
      },
    ],
    serverTs,
  });
}

export function logDuplicationAuditAndActivities(args: {
  readonly created: readonly (Document & ICard)[];
  readonly sourceCards: readonly SourceCardForDuplicate[];
  readonly targetListId: string;
  readonly targetBoardId: string;
  readonly userId: string;
  readonly skipAudit?: boolean;
  readonly skipActivities?: boolean;
}): void {
  const { created, sourceCards, targetListId, targetBoardId, userId, skipAudit, skipActivities } = args;

  if (skipAudit !== true) {
    for (let i = 0; i < created.length; i += 1) {
      const card = created[i];
      const source = sourceCards[i];
      if (card == null || source == null) {
        continue;
      }
      const originalCardId =
        typeof source._id === 'string' ? source._id : source._id.toString();
      logAuditEvent({
        userId,
        action: 'card.duplicate',
        resourceType: 'card',
        resourceId: originalCardId,
        metadata: { duplicatedCardId: card._id.toString(), targetListId, targetBoardId },
        timestamp: new Date(),
      });
    }
  }

  if (skipActivities !== true) {
    for (const card of created) {
      recordBoardActivityDeferred({
        boardId: targetBoardId,
        cardId: card._id.toString(),
        userId,
        category: 'cards',
        type: 'card.duplicated',
        description: `Card duplicated: "${card.title}"`,
        metadata: {
          entityId: card._id.toString(),
          entityName: card.title,
          listId: targetListId,
        },
      });
    }
  }
}
