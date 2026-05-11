import type { CardDB, ListDB } from './database.js';
import { spreadPosForIndex } from '../../shared/utils/cardListPos.js';
import {
  compareBoardListOrder,
  insertListPosBetween,
  spreadListPosForIndex,
} from '../../shared/utils/listPos.js';

function listNumericPos(row: ListDB): number {
  return typeof row.pos === 'number' && Number.isFinite(row.pos) ? row.pos : spreadListPosForIndex(row.position);
}

/** Align `position` and optimistic `pos` with array index (until server confirms). */
export function withRenumberedPositions(list: CardDB[]): CardDB[] {
  return list.map((c, i) => ({ ...c, position: i, pos: spreadPosForIndex(i) }));
}

/** Pure optimistic move: update only the two affected lists so memoized columns keep stable references. */
export function moveCardBetweenListsInMap(
  prev: Map<string, CardDB[]>,
  cardId: string,
  fromListId: string,
  toListId: string,
  insertIndex: number,
): Map<string, CardDB[]> {
  if (fromListId === toListId) {
    return prev;
  }
  const fromList = prev.get(fromListId);
  if (!fromList) {
    return prev;
  }
  const card = fromList.find((c) => c.id === cardId);
  if (card == null) {
    return prev;
  }

  const next = new Map(prev);
  const newFrom = withRenumberedPositions(fromList.filter((c) => c.id !== cardId));

  const toList = prev.get(toListId) || [];
  const toWithout = toList.filter((c) => c.id !== cardId);
  const clamped = Math.max(0, Math.min(insertIndex, toWithout.length));
  const moved: CardDB = { ...card, listId: toListId };
  const newTo = withRenumberedPositions([
    ...toWithout.slice(0, clamped),
    moved,
    ...toWithout.slice(clamped),
  ]);

  next.set(fromListId, newFrom);
  next.set(toListId, newTo);
  return next;
}

/** Move active list to the index slot of the hovered column (Trello-style in a single drag). */
export function moveListToHoverSlot(
  listsOrdered: ListDB[],
  activeListId: string,
  overListId: string,
): ListDB[] | null {
  if (activeListId === overListId) {
    return null;
  }
  const ordered = [...listsOrdered].sort((a, b) => compareBoardListOrder(a, b));
  const fromIdx = ordered.findIndex((l) => l.id === activeListId);
  const overIdx = ordered.findIndex((l) => l.id === overListId);
  if (fromIdx < 0 || overIdx < 0 || fromIdx === overIdx) {
    return null;
  }
  const next = [...ordered];
  const [removed] = next.splice(fromIdx, 1);
  if (removed == null) {
    return null;
  }
  next.splice(overIdx, 0, removed);
  const ins = next.findIndex((l) => l.id === activeListId);
  if (ins < 0) {
    return null;
  }
  const before = ins > 0 ? listNumericPos(next[ins - 1]!) : null;
  const after = ins < next.length - 1 ? listNumericPos(next[ins + 1]!) : null;
  const newPos = insertListPosBetween(before, after);
  return next.map((l, i) =>
    l.id === activeListId ? { ...l, position: i, pos: newPos } : { ...l, position: i },
  );
}

export function listOrderIdSignature(listsOrdered: readonly ListDB[]): string {
  return listsOrdered.map((l) => l.id).join(',');
}

export function insertIndexAgainstAnchor(
  cardsWithoutActive: CardDB[],
  anchorCardId: string,
  edge: 'above' | 'below',
): number {
  const i = cardsWithoutActive.findIndex((c) => c.id === anchorCardId);
  if (i < 0) {
    return cardsWithoutActive.length;
  }
  return edge === 'above' ? i : i + 1;
}
