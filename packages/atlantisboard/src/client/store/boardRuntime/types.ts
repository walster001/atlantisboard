import type { BoardDB, CardDB, ListDB } from '../database.js';
import { compareCardListOrder, spreadPosForIndex } from '../../../shared/utils/cardListPos.js';
import { compareBoardListOrder, spreadListPosForIndex } from '../../../shared/utils/listPos.js';

export function sortListIdsByPosition(listsById: Readonly<Record<string, ListDB>>): string[] {
  return Object.values(listsById)
    .filter((l) => l != null)
    .sort((a, b) => compareBoardListOrder(a, b))
    .map((l) => l.id);
}

export function mergeServerListOrderWithLocalLists(
  orderedListIds: readonly string[],
  listsById: Readonly<Record<string, ListDB>>,
): string[] {
  if (orderedListIds.length === 0) {
    return sortListIdsByPosition(listsById);
  }
  const idSet = new Set(orderedListIds);
  const orphanIds = Object.keys(listsById)
    .filter((id) => !idSet.has(id))
    .sort((a, b) => compareBoardListOrder(listsById[a]!, listsById[b]!));
  return [...orderedListIds.filter((id) => listsById[id] != null), ...orphanIds];
}

export function mergeListPreservingOrderWhenStale(
  prev: ListDB | undefined,
  incoming: ListDB,
  staleCutoffMs: number | null,
): ListDB {
  if (
    staleCutoffMs == null ||
    prev == null ||
    incoming.updatedAt.getTime() >= staleCutoffMs
  ) {
    return incoming;
  }
  const { pos: _incomingPos, position: _incomingPosition, ...incomingRest } = incoming;
  const next: ListDB = {
    ...incomingRest,
    position: prev.position,
    updatedAt: incoming.updatedAt,
  };
  if (typeof prev.pos === 'number' && Number.isFinite(prev.pos)) {
    return { ...next, pos: prev.pos };
  }
  return next;
}

export function rebuildCardIdsForList(
  listId: string,
  cardsById: Readonly<Record<string, CardDB>>,
): string[] {
  return Object.values(cardsById)
    .filter((c) => c.listId === listId)
    .sort((a, b) => compareCardListOrder(a, b))
    .map((c) => c.id);
}

export function rebuildAllCardIdsByList(
  orderedListIds: readonly string[],
  cardsById: Readonly<Record<string, CardDB>>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const lid of orderedListIds) {
    out[lid] = rebuildCardIdsForList(lid, cardsById);
  }
  return out;
}

export function removeCardIdFromList(ids: readonly string[], cardId: string): string[] {
  if (!ids.includes(cardId)) {
    return [...ids];
  }
  return ids.filter((id) => id !== cardId);
}

export function insertCardIdByPosition(
  existingIds: readonly string[],
  cardId: string,
  position: number,
): string[] {
  const without = removeCardIdFromList(existingIds, cardId);
  const clamped = Math.max(0, Math.min(position, without.length));
  const out = [...without];
  out.splice(clamped, 0, cardId);
  return out;
}

export function normalizeListCardPositions(
  cardsById: Record<string, CardDB>,
  listId: string,
  orderedCardIds: readonly string[],
): void {
  for (let i = 0; i < orderedCardIds.length; i += 1) {
    const id = orderedCardIds[i];
    const row = cardsById[id];
    if (row != null && row.listId === listId && row.position !== i) {
      cardsById[id] = { ...row, position: i };
    }
  }
}

export type BoardRuntimeSlice = {
  readonly activeBoardId: string | null;
  readonly board: BoardDB | null;
  readonly listsById: Readonly<Record<string, ListDB>>;
  readonly orderedListIds: readonly string[];
  readonly cardsById: Readonly<Record<string, CardDB>>;
  readonly cardIdsByListId: Readonly<Record<string, readonly string[]>>;
  readonly cardsVersion: number;
  readonly lastListsPositionServerTs: number | null;
};

export type BoardRuntimeActions = {
  clear: () => void;
  beginHydration: (params: { boardId: string; board: BoardDB }) => void;
  hydrateFromSnapshot: (params: {
    boardId: string;
    board: BoardDB;
    lists: readonly ListDB[];
    cardsByList: ReadonlyMap<string, readonly CardDB[]>;
  }) => void;
  commitBoard: (board: BoardDB) => void;
  upsertList: (list: ListDB) => void;
  upsertListsBatch: (lists: readonly ListDB[]) => void;
  removeList: (listId: string) => void;
  setListsFromArray: (lists: readonly ListDB[]) => void;
  applyListsPositionsFromOrder: (orderedListIds: readonly string[]) => void;
  applyListsBulkPositionPatch: (
    orderedListIds: readonly string[],
    orderedPos?: readonly number[],
    serverTs?: number,
  ) => void;
  upsertCard: (card: CardDB) => void;
  upsertCards: (cards: readonly CardDB[]) => void;
  removeCard: (cardId: string) => void;
  applyCardsReorderedInList: (
    listId: string,
    orderedCardIds: readonly string[],
    orderedPos?: readonly number[],
  ) => void;
  applyCardsBulkPositionPatch: (
    patches: ReadonlyArray<{
      listId: string;
      orderedCardIds: readonly string[];
      orderedPos?: readonly number[];
    }>,
  ) => void;
  applyListsBulkColor: (colorTrimmed: string) => void;
  applyCardsBulkColor: (listId: string | null, colorTrimmed: string) => void;
  applyLabelsRemovedBulk: (labelId: string, affectedCardIds: readonly string[]) => void;
  applyKanbanCardsMapPartial: (map: ReadonlyMap<string, readonly CardDB[]>) => void;
  patchCardsDescription: (patches: ReadonlyArray<{ id: string; description: string; descriptionHtml?: string }>) => void;
  applyBoardSettingsLivePatch: (patch: import('../database.js').BoardSettingsLivePatch) => void;
  resyncFullSnapshot: (params: {
    board: BoardDB;
    lists: readonly ListDB[];
    cardsByList: ReadonlyMap<string, readonly CardDB[]>;
  }) => void;
};

export type BoardRuntimeStore = BoardRuntimeSlice & BoardRuntimeActions;

export const emptyBoardRuntimeSlice: BoardRuntimeSlice = {
  activeBoardId: null,
  board: null,
  listsById: {},
  orderedListIds: [],
  cardsById: {},
  cardIdsByListId: {},
  cardsVersion: 0,
  lastListsPositionServerTs: null,
};

export { spreadListPosForIndex, spreadPosForIndex };
