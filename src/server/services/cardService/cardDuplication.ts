import type { Document } from 'mongoose';
import { Card, type ICard } from '../../models/Card.js';
import { Board } from '../../models/Board.js';
import { hasPermission } from '../../utils/permissions.js';
import { loadListOrderAfterInsert, loadTargetListContext } from './cardDuplicationLoad.js';
import { emitDuplicationRealtime, logDuplicationAuditAndActivities } from './cardDuplicationEmit.js';
import { buildDuplicateInsertPlans, persistDuplicatedCards } from './cardDuplicationPersist.js';
import {
  ForbiddenError,
  NotFoundError,
} from '../../../shared/errors/domainErrors.js';
import type {
  DuplicateCardOptions,
  DuplicateCardsBatchOptions,
  SourceCardForDuplicate,
} from './cardDuplicationTypes.js';

export type { SourceCardForDuplicate, DuplicateCardOptions, DuplicateCardsBatchOptions } from './cardDuplicationTypes.js';

/**
 * Duplicates multiple cards into one list in a single batched write (shared positioning sync and socket batch).
 */
export async function duplicateCardsBatch(
  sourceCards: readonly SourceCardForDuplicate[],
  targetListId: string,
  userId: string,
  options: DuplicateCardsBatchOptions = {},
): Promise<(Document & ICard)[]> {
  if (sourceCards.length === 0) {
    return [];
  }

  const { targetBoardId } = await loadTargetListContext(targetListId, userId, sourceCards);
  const { docs } = await buildDuplicateInsertPlans(sourceCards, targetListId, targetBoardId, userId);
  const created = await persistDuplicatedCards(targetListId, docs);
  const { orderedCardIds, orderedPos } = await loadListOrderAfterInsert(targetListId);

  const sourceBoardIdForSocket =
    options.sourceBoardIdForSocket ??
    (typeof sourceCards[0]!.boardId === 'string'
      ? sourceCards[0]!.boardId
      : sourceCards[0]!.boardId.toString());

  emitDuplicationRealtime({
    created,
    sourceCards,
    targetListId,
    targetBoardId,
    sourceBoardIdForSocket,
    orderedCardIds,
    orderedPos,
  });

  logDuplicationAuditAndActivities({
    created,
    sourceCards,
    targetListId,
    targetBoardId,
    userId,
    ...(options.skipAudit !== undefined ? { skipAudit: options.skipAudit } : {}),
    ...(options.skipActivities !== undefined ? { skipActivities: options.skipActivities } : {}),
  });

  return created;
}

export async function duplicateCard(
  cardId: string,
  targetListId: string,
  userId: string,
  options: DuplicateCardOptions = {},
): Promise<(Document & ICard) | null> {
  const sourceCard = await Card.findById(cardId);
  if (sourceCard == null) {
    return null;
  }

  const board = await Board.findById(sourceCard.boardId);
  if (board == null) {
    throw new NotFoundError('Board not found');
  }

  if (!options.skipSourcePermissionCheck && board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, sourceCard.boardId.toString(), 'cards.duplicate');
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions to duplicate card');
    }
  }

  const created = await duplicateCardsBatch([sourceCard], targetListId, userId, {
    ...options,
    sourceBoardIdForSocket: sourceCard.boardId.toString(),
  });

  return created[0] ?? null;
}
