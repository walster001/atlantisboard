import { type Document } from 'mongoose';
import { Card, type ICard } from '../../models/Card.js';
import { List } from '../../models/List.js';
import { Board } from '../../models/Board.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { createActivity } from '../activityService.js';
import { hasPermission } from '../../utils/permissions.js';
import { emitToBoard } from '../../utils/socketIO.js';
import {
  CARD_POS_STEP,
  insertPosBetween,
  posGapTooSmall,
  posNeedsNormalize,
  spreadPosForIndex,
} from '../../../shared/utils/cardListPos.js';
import {
  ensureCardsHavePosForList,
  normalizeListPosSpread,
  sortCardRowsByPos,
  syncListPositionsFromPosOrder,
  type CardPosLeanRow,
} from './positioning.js';
import { getBoardListCardLimits } from './types.js';

export async function moveCard(
  cardId: string,
  targetListId: string,
  position: number,
  userId: string,
): Promise<(Document & ICard) | null> {
  let card = await Card.findById(cardId);
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

  const originalListId = card.listId.toString();
  const desiredTargetPosition = Math.max(0, Math.floor(position));
  const normalizedListIds = new Set<string>();

  await ensureCardsHavePosForList(targetListId);
  await ensureCardsHavePosForList(originalListId);

  const rowNumericPos = (r: CardPosLeanRow): number =>
    typeof r.pos === 'number' && Number.isFinite(r.pos) ? r.pos : (r.position + 1) * CARD_POS_STEP;

  const loadTargetNeighbors = async (): Promise<CardPosLeanRow[]> => {
    const rows = await Card.find({ listId: targetListId, _id: { $ne: cardId } })
      .select('pos position')
      .lean<CardPosLeanRow[]>();
    return sortCardRowsByPos(rows);
  };

  let neighbors = await loadTargetNeighbors();
  let neighborPos = neighbors.map(rowNumericPos);
  if (posNeedsNormalize(neighborPos)) {
    await normalizeListPosSpread(targetListId);
    normalizedListIds.add(targetListId);
    neighbors = await loadTargetNeighbors();
    neighborPos = neighbors.map(rowNumericPos);
  }

  let insertIndex = Math.min(desiredTargetPosition, neighbors.length);
  let before = insertIndex > 0 ? neighborPos[insertIndex - 1]! : null;
  let after = insertIndex < neighborPos.length ? neighborPos[insertIndex]! : null;
  let newPos = insertPosBetween(before, after);
  if (posGapTooSmall(before, after)) {
    await normalizeListPosSpread(targetListId);
    normalizedListIds.add(targetListId);
    neighbors = await loadTargetNeighbors();
    neighborPos = neighbors.map(rowNumericPos);
    insertIndex = Math.min(desiredTargetPosition, neighbors.length);
    before = insertIndex > 0 ? neighborPos[insertIndex - 1]! : null;
    after = insertIndex < neighborPos.length ? neighborPos[insertIndex]! : null;
    newPos = insertPosBetween(before, after);
  }

  card.listId = targetListId as unknown as typeof card.boardId;
  card.set('pos', newPos);
  card.markModified('pos');
  await card.save();

  await syncListPositionsFromPosOrder(targetListId);
  if (originalListId !== targetListId) {
    await syncListPositionsFromPosOrder(originalListId);
  }

  const maybeRenormalize = async (lid: string): Promise<void> => {
    const rows = sortCardRowsByPos(
      await Card.find({ listId: lid }).select('pos position').lean<CardPosLeanRow[]>(),
    );
    const pl = rows.map(rowNumericPos);
    if (pl.length >= 2 && posNeedsNormalize(pl)) {
      await normalizeListPosSpread(lid);
      normalizedListIds.add(lid);
    }
  };
  await maybeRenormalize(targetListId);
  if (originalListId !== targetListId) {
    await maybeRenormalize(originalListId);
  }

  const refreshed = await Card.findById(cardId);
  if (refreshed != null) {
    card = refreshed;
  }

  const boardId = card.boardId.toString();
  const serverTs = Date.now();
  emitToBoard(boardId, 'card:updated', {
    cardId,
    boardId,
    data: card.toObject(),
    serverTs,
  });
  if (normalizedListIds.size > 0) {
    const buildListPayload = async (lid: string) => {
      const rows = sortCardRowsByPos(
        await Card.find({ listId: lid }).select('pos position').lean<CardPosLeanRow[]>(),
      );
      return {
        listId: lid,
        orderedCardIds: rows.map((r) => r._id.toString()),
        orderedPos: rows.map((r) => rowNumericPos(r)),
      };
    };
    const listReorders = await Promise.all([...normalizedListIds].map((lid) => buildListPayload(lid)));
    emitToBoard(boardId, 'cards:positions-batch-updated', {
      boardId,
      fromListId: originalListId,
      toListId: targetListId,
      movedCardId: cardId,
      position: desiredTargetPosition,
      lists: listReorders,
      serverTs,
    });
  }

  logAuditEvent({
    userId,
    action: 'card.move',
    resourceType: 'card',
    resourceId: cardId,
    metadata: { fromListId: originalListId, toListId: targetListId, position: desiredTargetPosition },
    timestamp: new Date(),
  });

  createActivity({
    boardId: card.boardId.toString(),
    cardId,
    userId,
    type: 'card.moved',
    description: `Card moved to list "${targetList.name}"`,
  });

  return card;
}

export async function reorderCards(
  listId: string,
  cardIds: string[],
  userId: string,
  options?: { readonly mode?: 'bulk_reflow' },
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

  const mode = options?.mode ?? 'bulk_reflow';
  if (mode !== 'bulk_reflow') {
    throw new Error('reorderCards only supports bulk_reflow mode');
  }

  if (board.ownerId.toString() !== userId) {
    const [canReorderCards, canUpdateBoard] = await Promise.all([
      hasPermission({ id: userId }, list.boardId.toString(), 'cards.reorder'),
      hasPermission({ id: userId }, list.boardId.toString(), 'boards.update'),
    ]);
    if (!canReorderCards || !canUpdateBoard) {
      throw new Error('Insufficient permissions to reorder cards in bulk reflow mode');
    }
  }

  await ensureCardsHavePosForList(listId);
  const orderedPos = cardIds.map((_, index) => spreadPosForIndex(index));
  await Promise.all(
    cardIds.map((cid, index) => Card.findByIdAndUpdate(cid, { position: index, listId, pos: orderedPos[index] })),
  );

  emitToBoard(list.boardId.toString(), 'cards:positions-batch-updated', {
    boardId: list.boardId.toString(),
    fromListId: listId,
    toListId: listId,
    lists: [
      {
        listId,
        orderedCardIds: [...cardIds].map(String),
        orderedPos,
      },
    ],
    serverTs: Date.now(),
  });

  logAuditEvent({
    userId,
    action: 'card.reorder.bulk_reflow',
    resourceType: 'list',
    resourceId: listId,
    metadata: { cardIds, mode: 'bulk_reflow' },
    timestamp: new Date(),
  });

  return true;
}
