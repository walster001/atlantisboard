import { Card } from '../../models/Card.js';
import { List } from '../../models/List.js';
import { Board } from '../../models/Board.js';
import { hasPermission } from '../../utils/permissions.js';
import {
  CARD_POS_STEP,
  insertPosBetween,
  posGapTooSmall,
  posNeedsNormalize,
} from '../../../shared/utils/cardListPos.js';
import {
  ensureCardsHavePosForList,
  normalizeListPosSpread,
  sortCardRowsByPos,
  type CardPosLeanRow,
} from './positioning.js';
import { getBoardListCardLimits } from './types.js';
import type { SourceCardForDuplicate } from './cardDuplicationTypes.js';

export const rowNumericPos = (r: CardPosLeanRow): number =>
  typeof r.pos === 'number' && Number.isFinite(r.pos) ? r.pos : (r.position + 1) * CARD_POS_STEP;

export async function computeInsertPosValuesAtTopOfList(listId: string, count: number): Promise<number[]> {
  if (count <= 0) {
    return [];
  }

  await ensureCardsHavePosForList(listId);

  const loadNeighborPos = async (): Promise<number[]> => {
    const rows = sortCardRowsByPos(
      await Card.find({ listId }).select('pos position').lean<CardPosLeanRow[]>(),
    );
    return rows.map(rowNumericPos);
  };

  let neighborPos = await loadNeighborPos();
  if (neighborPos.length >= 2 && posNeedsNormalize(neighborPos)) {
    await normalizeListPosSpread(listId);
    neighborPos = await loadNeighborPos();
  }

  const values: number[] = new Array(count);
  let after: number | null = neighborPos.length > 0 ? neighborPos[0]! : null;

  for (let i = count - 1; i >= 0; i -= 1) {
    if (i === count - 1 && posGapTooSmall(null, after)) {
      await normalizeListPosSpread(listId);
      neighborPos = await loadNeighborPos();
      after = neighborPos.length > 0 ? neighborPos[0]! : null;
    }
    const newPos = insertPosBetween(null, after);
    values[i] = newPos;
    after = newPos;
  }

  return values;
}

export async function maybeRenormalizeListPos(listId: string): Promise<void> {
  const rows = sortCardRowsByPos(
    await Card.find({ listId }).select('pos position').lean<CardPosLeanRow[]>(),
  );
  const pl = rows.map(rowNumericPos);
  if (pl.length >= 2 && posNeedsNormalize(pl)) {
    await normalizeListPosSpread(listId);
  }
}

export interface TargetListContext {
  readonly targetListId: string;
  readonly targetBoardId: string;
}

/** Validates target list/board access and card limit before duplication. */
export async function loadTargetListContext(
  targetListId: string,
  userId: string,
  sourceCards: readonly SourceCardForDuplicate[],
): Promise<TargetListContext> {
  const targetList = await List.findById(targetListId);
  if (targetList == null) {
    throw new Error('Target list not found');
  }

  const targetBoardId = targetList.boardId.toString();
  const targetBoard = await Board.findById(targetBoardId);
  if (targetBoard == null) {
    throw new Error('Target board not found');
  }

  if (targetBoard.ownerId.toString() !== userId) {
    const canViewTarget = await hasPermission({ id: userId }, targetBoardId, 'boards.view');
    if (!canViewTarget) {
      throw new Error('Insufficient permissions to view target board');
    }
  }

  const { max, enforce } = getBoardListCardLimits(targetBoard);
  if (enforce) {
    const cardCount = await Card.countDocuments({ listId: targetListId });
    if (cardCount + sourceCards.length > max) {
      throw new Error(`Target list cannot exceed maximum card limit of ${max}`);
    }
  }

  return { targetListId, targetBoardId };
}

export async function loadListOrderAfterInsert(
  targetListId: string,
): Promise<{ readonly orderedCardIds: readonly string[]; readonly orderedPos: readonly number[] }> {
  const listOrderRows = sortCardRowsByPos(
    await Card.find({ listId: targetListId }).select('pos position').lean<CardPosLeanRow[]>(),
  );
  return {
    orderedCardIds: listOrderRows.map((r) => r._id.toString()),
    orderedPos: listOrderRows.map((r) => rowNumericPos(r)),
  };
}
