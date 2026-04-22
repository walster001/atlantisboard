import { create } from 'zustand';
import type { BoardDB, BoardSettingsLivePatch, CardDB, ListDB } from './database.js';
import { moveCardBetweenListsInMap, withRenumberedPositions } from './kanbanDragPure.js';

function sortListIdsByPosition(listsById: Readonly<Record<string, ListDB>>): string[] {
  return Object.values(listsById)
    .filter((l) => l != null)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((l) => l.id);
}

function rebuildCardIdsForList(
  listId: string,
  cardsById: Readonly<Record<string, CardDB>>,
): string[] {
  return Object.values(cardsById)
    .filter((c) => c.listId === listId)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((c) => c.id);
}

function rebuildAllCardIdsByList(
  orderedListIds: readonly string[],
  cardsById: Readonly<Record<string, CardDB>>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const lid of orderedListIds) {
    out[lid] = rebuildCardIdsForList(lid, cardsById);
  }
  return out;
}

export function buildKanbanCardsMapFromRuntimeState(s: BoardRuntimeSlice): Map<string, CardDB[]> {
  const m = new Map<string, CardDB[]>();
  for (const lid of s.orderedListIds) {
    const ids = s.cardIdsByListId[lid] ?? [];
    const arr = ids.map((id) => s.cardsById[id]).filter((c): c is CardDB => c != null);
    m.set(lid, arr);
  }
  return m;
}

export type BoardRuntimeSlice = {
  readonly activeBoardId: string | null;
  readonly board: BoardDB | null;
  readonly listsById: Readonly<Record<string, ListDB>>;
  readonly orderedListIds: readonly string[];
  readonly cardsById: Readonly<Record<string, CardDB>>;
  readonly cardIdsByListId: Readonly<Record<string, readonly string[]>>;
  readonly cardsVersion: number;
};

type BoardRuntimeActions = {
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
  removeList: (listId: string) => void;
  setListsFromArray: (lists: readonly ListDB[]) => void;
  applyListsPositionsFromOrder: (orderedListIds: readonly string[]) => void;
  upsertCard: (card: CardDB) => void;
  removeCard: (cardId: string) => void;
  applyCardsReorderedInList: (listId: string, orderedCardIds: readonly string[]) => void;
  applyListsBulkColor: (colorTrimmed: string) => void;
  applyCardsBulkColor: (listId: string | null, colorTrimmed: string) => void;
  applyLabelsRemovedBulk: (labelId: string, affectedCardIds: readonly string[]) => void;
  /** Drag / optimistic: replace cards for one or more lists from a map slice. */
  applyKanbanCardsMapPartial: (map: ReadonlyMap<string, readonly CardDB[]>) => void;
  patchCardsDescription: (patches: ReadonlyArray<{ id: string; description: string; descriptionHtml?: string }>) => void;
  applyBoardSettingsLivePatch: (patch: BoardSettingsLivePatch) => void;
  resyncFullSnapshot: (params: {
    board: BoardDB;
    lists: readonly ListDB[];
    cardsByList: ReadonlyMap<string, readonly CardDB[]>;
  }) => void;
};

export type BoardRuntimeStore = BoardRuntimeSlice & BoardRuntimeActions;

const empty: BoardRuntimeSlice = {
  activeBoardId: null,
  board: null,
  listsById: {},
  orderedListIds: [],
  cardsById: {},
  cardIdsByListId: {},
  cardsVersion: 0,
};

export const useBoardRuntimeStore = create<BoardRuntimeStore>((set, get) => ({
  ...empty,

  clear: () => {
    set(empty);
  },

  beginHydration: ({ boardId, board }) => {
    set((s) => ({
      activeBoardId: boardId,
      board,
      listsById: {},
      orderedListIds: [],
      cardsById: {},
      cardIdsByListId: {},
      cardsVersion: s.cardsVersion + 1,
    }));
  },

  hydrateFromSnapshot: ({ boardId, board, lists, cardsByList }) => {
    const listsById: Record<string, ListDB> = {};
    for (const l of lists) {
      listsById[l.id] = l;
    }
    const orderedListIds = [...lists].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).map((l) => l.id);
    const cardsById: Record<string, CardDB> = {};
    for (const lid of orderedListIds) {
      const arr = cardsByList.get(lid) ?? [];
      for (const c of arr) {
        cardsById[c.id] = c;
      }
    }
    const cardIdsByListId = rebuildAllCardIdsByList(orderedListIds, cardsById);
    set({
      activeBoardId: boardId,
      board,
      listsById,
      orderedListIds,
      cardsById,
      cardIdsByListId,
      cardsVersion: get().cardsVersion + 1,
    });
  },

  resyncFullSnapshot: ({ board, lists, cardsByList }) => {
    const bid = get().activeBoardId;
    if (bid == null || board.id !== bid) {
      return;
    }
    get().hydrateFromSnapshot({ boardId: bid, board, lists, cardsByList });
  },

  commitBoard: (board) => {
    if (get().activeBoardId !== board.id) {
      return;
    }
    set({ board });
  },

  upsertList: (list) => {
    if (get().activeBoardId !== list.boardId) {
      return;
    }
    set((s) => {
      const listsById = { ...s.listsById, [list.id]: list };
      const orderedListIds = sortListIdsByPosition(listsById);
      return { listsById, orderedListIds, cardsVersion: s.cardsVersion + 1 };
    });
  },

  removeList: (listId) => {
    set((s) => {
      if (s.activeBoardId == null) {
        return s;
      }
      const { [listId]: _removed, ...restLists } = s.listsById;
      const cardsById = { ...s.cardsById };
      for (const id of Object.keys(cardsById)) {
        if (cardsById[id]?.listId === listId) {
          delete cardsById[id];
        }
      }
      const cardIdsByListId = { ...s.cardIdsByListId };
      delete cardIdsByListId[listId];
      const orderedListIds = sortListIdsByPosition(restLists);
      return {
        listsById: restLists,
        orderedListIds,
        cardsById,
        cardIdsByListId,
        cardsVersion: s.cardsVersion + 1,
      };
    });
  },

  setListsFromArray: (lists) => {
    const activeId = get().activeBoardId;
    if (activeId == null) {
      return;
    }
    if (lists.some((l) => l.boardId !== activeId)) {
      return;
    }
    const listsById: Record<string, ListDB> = {};
    for (const l of lists) {
      listsById[l.id] = l;
    }
    const orderedListIds = sortListIdsByPosition(listsById);
    set((s) => ({ listsById, orderedListIds, cardsVersion: s.cardsVersion + 1 }));
  },

  applyListsPositionsFromOrder: (orderedListIds) => {
    set((s) => {
      if (s.activeBoardId == null) {
        return s;
      }
      const listsById = { ...s.listsById };
      for (let i = 0; i < orderedListIds.length; i += 1) {
        const id = orderedListIds[i];
        const row = listsById[id];
        if (row != null) {
          listsById[id] = { ...row, position: i };
        }
      }
      const nextOrder = sortListIdsByPosition(listsById);
      return { listsById, orderedListIds: nextOrder, cardsVersion: s.cardsVersion + 1 };
    });
  },

  upsertCard: (card) => {
    if (get().activeBoardId !== card.boardId) {
      return;
    }
    set((s) => {
      const prev = s.cardsById[card.id];
      const cardsById = { ...s.cardsById, [card.id]: card };
      let cardIdsByListId = { ...s.cardIdsByListId };
      if (prev != null && prev.listId !== card.listId) {
        cardIdsByListId = {
          ...cardIdsByListId,
          [prev.listId]: rebuildCardIdsForList(prev.listId, cardsById),
          [card.listId]: rebuildCardIdsForList(card.listId, cardsById),
        };
      } else {
        cardIdsByListId = {
          ...cardIdsByListId,
          [card.listId]: rebuildCardIdsForList(card.listId, cardsById),
        };
      }
      return { cardsById, cardIdsByListId, cardsVersion: s.cardsVersion + 1 };
    });
  },

  removeCard: (cardId) => {
    set((s) => {
      const prev = s.cardsById[cardId];
      if (prev == null) {
        return s;
      }
      const { [cardId]: _r, ...rest } = s.cardsById;
      const cardIdsByListId = {
        ...s.cardIdsByListId,
        [prev.listId]: rebuildCardIdsForList(prev.listId, rest),
      };
      return { cardsById: rest, cardIdsByListId, cardsVersion: s.cardsVersion + 1 };
    });
  },

  applyCardsReorderedInList: (listId, orderedCardIds) => {
    set((s) => {
      const prevOrdered = s.cardIdsByListId[listId] ?? [];
      const sameOrder =
        prevOrdered.length === orderedCardIds.length &&
        prevOrdered.every((id, i) => id === orderedCardIds[i]);
      if (sameOrder) {
        return s;
      }
      const cardsById = { ...s.cardsById };
      for (let i = 0; i < orderedCardIds.length; i += 1) {
        const id = orderedCardIds[i];
        const row = cardsById[id];
        if (row != null && row.listId === listId) {
          cardsById[id] = { ...row, position: i };
        }
      }
      const cardIdsByListId = {
        ...s.cardIdsByListId,
        [listId]: [...orderedCardIds],
      };
      return { cardsById, cardIdsByListId, cardsVersion: s.cardsVersion + 1 };
    });
  },

  applyListsBulkColor: (colorTrimmed) => {
    set((s) => {
      if (s.activeBoardId == null || s.board == null) {
        return s;
      }
      const bid = s.board.id;
      const listsById = { ...s.listsById };
      for (const id of Object.keys(listsById)) {
        const row = listsById[id];
        if (row == null || row.boardId !== bid) {
          continue;
        }
        listsById[id] =
          colorTrimmed === ''
            ? ((): ListDB => {
                const next: ListDB = { ...row };
                delete next.color;
                return next;
              })()
            : { ...row, color: colorTrimmed };
      }
      return { listsById, cardsVersion: s.cardsVersion + 1 };
    });
  },

  applyCardsBulkColor: (listId, colorTrimmed) => {
    set((s) => {
      if (s.activeBoardId == null || s.board == null) {
        return s;
      }
      const bid = s.board.id;
      const cardsById = { ...s.cardsById };
      for (const id of Object.keys(cardsById)) {
        const row = cardsById[id];
        if (row == null || row.boardId !== bid) {
          continue;
        }
        if (listId != null && row.listId !== listId) {
          continue;
        }
        cardsById[id] =
          colorTrimmed === ''
            ? ((): CardDB => {
                const next: CardDB = { ...row };
                delete next.color;
                return next;
              })()
            : { ...row, color: colorTrimmed };
      }
      return { cardsById, cardsVersion: s.cardsVersion + 1 };
    });
  },

  applyLabelsRemovedBulk: (labelId, affectedCardIds) => {
    const rm = String(labelId);
    set((s) => {
      const cardsById = { ...s.cardsById };
      for (const cid of affectedCardIds) {
        const row = cardsById[cid];
        if (row == null) {
          continue;
        }
        const prevLabels = Array.isArray(row.labels) ? row.labels : [];
        cardsById[cid] = {
          ...row,
          labels: prevLabels.filter((l) => String(l.id) !== rm),
        };
      }
      return { cardsById, cardsVersion: s.cardsVersion + 1 };
    });
  },

  applyKanbanCardsMapPartial: (map) => {
    set((s) => {
      const cardsById = { ...s.cardsById };
      const cardIdsByListId = { ...s.cardIdsByListId };
      for (const [lid, arr] of map) {
        for (const id of cardIdsByListId[lid] ?? []) {
          delete cardsById[id];
        }
        cardIdsByListId[lid] = arr.map((c) => c.id);
        for (const c of arr) {
          cardsById[c.id] = c;
        }
      }
      return { cardsById, cardIdsByListId, cardsVersion: s.cardsVersion + 1 };
    });
  },

  patchCardsDescription: (patches) => {
    if (patches.length === 0) {
      return;
    }
    set((s) => {
      const cardsById = { ...s.cardsById };
      for (const p of patches) {
        const row = cardsById[p.id];
        if (row == null) {
          continue;
        }
        cardsById[p.id] = {
          ...row,
          description: p.description ?? row.description ?? '',
          ...(p.descriptionHtml !== undefined ? { descriptionHtml: p.descriptionHtml } : {}),
        };
      }
      return { cardsById, cardsVersion: s.cardsVersion + 1 };
    });
  },

  applyBoardSettingsLivePatch: (patch) => {
    set((s) => {
      if (s.board == null) {
        return s;
      }
      const nextSettings: BoardDB['settings'] = { ...s.board.settings };
      const { memberActivityLogRetentionDays: retentionPatch, ...restPatch } = patch;
      Object.assign(nextSettings, restPatch);
      if (Object.prototype.hasOwnProperty.call(patch, 'memberActivityLogRetentionDays')) {
        if (retentionPatch === null || retentionPatch === undefined) {
          delete nextSettings.memberActivityLogRetentionDays;
        } else {
          nextSettings.memberActivityLogRetentionDays = retentionPatch;
        }
      }
      return { board: { ...s.board, settings: nextSettings } };
    });
  },
}));

/** Used by drag helpers — same semantics as previous Kanban `setCards` updater. */
export function boardRuntimeApplySetCardsFromUpdater(
  updater: (prev: Map<string, CardDB[]>) => Map<string, CardDB[]>,
): void {
  const store = useBoardRuntimeStore.getState();
  if (store.activeBoardId == null) {
    return;
  }
  const prevMap = buildKanbanCardsMapFromRuntimeState(store);
  const nextMap = updater(prevMap);
  store.applyKanbanCardsMapPartial(nextMap);
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
