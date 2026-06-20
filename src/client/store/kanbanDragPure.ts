import type { CardDB, ListDB } from './database.js';
import {
  compareCardListOrder,
  insertPosBetween,
  spreadPosForIndex,
} from '../../shared/utils/cardListPos.js';
import {
  compareBoardListOrder,
  insertListPosBetween,
  spreadListPosForIndex,
} from '../../shared/utils/listPos.js';

function listNumericPos(row: ListDB): number {
  return typeof row.pos === 'number' && Number.isFinite(row.pos) ? row.pos : spreadListPosForIndex(row.position);
}

function cardNumericPos(row: CardDB): number {
  return typeof row.pos === 'number' && Number.isFinite(row.pos) ? row.pos : spreadPosForIndex(row.position);
}

function syncPositionIndices(list: readonly CardDB[]): CardDB[] {
  return list.map((c, i) => (c.position === i ? c : { ...c, position: i }));
}

/** Bulk reflow: spread fractional pos for every card (import / legacy paths). */
export function withRenumberedPositions(list: readonly CardDB[]): CardDB[] {
  return list.map((c, i) => ({ ...c, position: i, pos: spreadPosForIndex(i) }));
}

/** Pure optimistic move: update only affected lists so memoized columns keep stable references. */
export function moveCardBetweenListsInMap(
  prev: ReadonlyMap<string, readonly CardDB[]>,
  cardId: string,
  fromListId: string,
  toListId: string,
  insertIndex: number,
): Map<string, CardDB[]> {
  const fromList = prev.get(fromListId);
  if (!fromList) {
    return prev instanceof Map ? prev : cloneCardMap(prev);
  }
  const card = fromList.find((c) => c.id === cardId);
  if (card == null) {
    return prev instanceof Map ? prev : cloneCardMap(prev);
  }

  const next = cloneCardMap(prev);
  const fromWithout = fromList.filter((c) => c.id !== cardId);
  const toSource = fromListId === toListId ? fromList : (prev.get(toListId) ?? []);
  const toWithout = [...toSource].sort(compareCardListOrder).filter((c) => c.id !== cardId);
  const clamped = Math.max(0, Math.min(insertIndex, toWithout.length));
  const before = clamped > 0 ? cardNumericPos(toWithout[clamped - 1]!) : null;
  const after = clamped < toWithout.length ? cardNumericPos(toWithout[clamped]!) : null;
  const newPos = insertPosBetween(before, after);
  const moved: CardDB =
    fromListId === toListId
      ? { ...card, pos: newPos, position: clamped }
      : { ...card, listId: toListId, pos: newPos, position: clamped };
  const nextTo = syncPositionIndices([
    ...toWithout.slice(0, clamped),
    moved,
    ...toWithout.slice(clamped),
  ]);

  if (fromListId === toListId) {
    next.set(fromListId, nextTo);
    return next;
  }

  next.set(fromListId, syncPositionIndices(fromWithout));
  next.set(toListId, nextTo);
  return next;
}

function cloneCardMap(prev: ReadonlyMap<string, readonly CardDB[]>): Map<string, CardDB[]> {
  return new Map([...prev.entries()].map(([listId, cards]) => [listId, [...cards]]));
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
