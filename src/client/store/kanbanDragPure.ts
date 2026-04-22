import type { CardDB, ListDB } from './database.js';

/** Align `position` with array index (server order). */
export function withRenumberedPositions(list: CardDB[]): CardDB[] {
  return list.map((c, i) => ({ ...c, position: i }));
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
  const ordered = [...listsOrdered].sort((a, b) => a.position - b.position);
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
  return next.map((l, i) => ({ ...l, position: i }));
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
