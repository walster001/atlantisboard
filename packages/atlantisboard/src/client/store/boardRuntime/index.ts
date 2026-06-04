import { create } from 'zustand';
import type { CardDB } from '../database.js';
import { moveCardBetweenListsInMap, withRenumberedPositions } from '../kanbanDragPure.js';
import { createBoardActiveContextSlice } from './boardActiveContextSlice.js';
import { createBoardCardMapSlice } from './boardCardMapSlice.js';
import { createBoardListOrderSlice } from './boardListOrderSlice.js';
import {
  emptyBoardRuntimeSlice,
  type BoardRuntimeSlice,
  type BoardRuntimeStore,
} from './types.js';

export type { BoardRuntimeSlice, BoardRuntimeActions, BoardRuntimeStore } from './types.js';

export function buildKanbanCardsMapFromRuntimeState(s: BoardRuntimeSlice): Map<string, CardDB[]> {
  const m = new Map<string, CardDB[]>();
  for (const lid of s.orderedListIds) {
    const ids = s.cardIdsByListId[lid] ?? [];
    const arr = ids.map((id) => s.cardsById[id]).filter((c): c is CardDB => c != null);
    m.set(lid, arr);
  }
  return m;
}

export const useBoardRuntimeStore = create<BoardRuntimeStore>((set, get, api) => ({
  ...emptyBoardRuntimeSlice,
  ...createBoardActiveContextSlice(set, get, api),
  ...createBoardListOrderSlice(set, get, api),
  ...createBoardCardMapSlice(set, get, api),
}));

export function boardRuntimeApplySetCardsFromUpdater(
  updater: (prev: Map<string, CardDB[]>) => Map<string, CardDB[]>,
): void {
  const store = useBoardRuntimeStore.getState();
  if (store.activeBoardId == null) {
    return;
  }
  const prevMap = buildKanbanCardsMapFromRuntimeState(store);
  const nextMap = updater(prevMap);
  const partial = new Map<string, CardDB[]>();
  for (const [listId, nextCards] of nextMap) {
    const prevCards = prevMap.get(listId) ?? [];
    const unchanged =
      prevCards.length === nextCards.length && prevCards.every((card, idx) => card.id === nextCards[idx]?.id);
    if (!unchanged) {
      partial.set(listId, nextCards);
    }
  }
  if (partial.size > 0) {
    store.applyKanbanCardsMapPartial(partial);
  }
}

export function boardRuntimeMoveCardBetweenLists(
  activeIdStr: string,
  activeListId: string,
  targetListId: string,
  insertIndex: number,
): void {
  boardRuntimeApplySetCardsFromUpdater((prev) =>
    moveCardBetweenListsInMap(prev, activeIdStr, activeListId, targetListId, insertIndex),
  );
}

export function boardRuntimeRenumberListOrder(activeListId: string, renumbered: readonly CardDB[]): void {
  const slice = new Map<string, CardDB[]>();
  slice.set(activeListId, [...renumbered]);
  useBoardRuntimeStore.getState().applyKanbanCardsMapPartial(slice);
}

export function boardRuntimeReorderSingleListCards(activeListId: string, newListCards: readonly CardDB[]): void {
  const renumbered = withRenumberedPositions([...newListCards]);
  boardRuntimeRenumberListOrder(activeListId, renumbered);
}

export function boardRuntimeApplyBulkListCardOrderPatches(
  patches: ReadonlyArray<{
    listId: string;
    orderedCardIds: readonly string[];
    orderedPos?: readonly number[];
  }>,
): void {
  useBoardRuntimeStore.getState().applyCardsBulkPositionPatch(patches);
}
