import type { StateCreator } from 'zustand';
import type { ListDB } from '../database.js';
import {
  mergeListPreservingOrderWhenStale,
  mergeServerListOrderWithLocalLists,
  sortListIdsByPosition,
  spreadListPosForIndex,
  type BoardRuntimeStore,
} from './types.js';

export const createBoardListOrderSlice: StateCreator<
  BoardRuntimeStore,
  [],
  [],
  Pick<
    BoardRuntimeStore,
    | 'upsertList'
    | 'upsertListsBatch'
    | 'removeList'
    | 'setListsFromArray'
    | 'applyListsPositionsFromOrder'
    | 'applyListsBulkPositionPatch'
    | 'applyListsBulkColor'
  >
> = (set, get) => ({
  upsertList: (list) => {
    if (get().activeBoardId !== list.boardId) {
      return;
    }
    set((s) => {
      const prev = s.listsById[list.id];
      const merged = mergeListPreservingOrderWhenStale(prev, list, s.lastListsPositionServerTs);
      const listsById = { ...s.listsById, [list.id]: merged };
      const orderedListIds = sortListIdsByPosition(listsById);
      return { listsById, orderedListIds, cardsVersion: s.cardsVersion + 1 };
    });
  },

  upsertListsBatch: (lists) => {
    if (lists.length === 0) {
      return;
    }
    const activeId = get().activeBoardId;
    if (activeId == null) {
      return;
    }
    set((s) => {
      const staleCutoff = s.lastListsPositionServerTs;
      let listsById = { ...s.listsById };
      for (const list of lists) {
        if (list.boardId !== activeId) {
          continue;
        }
        const prev = listsById[list.id];
        const merged = mergeListPreservingOrderWhenStale(prev, list, staleCutoff);
        listsById = { ...listsById, [list.id]: merged };
      }
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
    set((s) => ({
      listsById,
      orderedListIds,
      cardsVersion: s.cardsVersion + 1,
      lastListsPositionServerTs: null,
    }));
  },

  applyListsPositionsFromOrder: (orderedListIds) => {
    set((s) => {
      if (s.activeBoardId == null) {
        return s;
      }
      const listsById = { ...s.listsById };
      const hasServerPos = Array.isArray(orderedListIds) && orderedListIds.length > 0;
      for (let i = 0; i < orderedListIds.length; i += 1) {
        const id = orderedListIds[i];
        const row = listsById[id];
        if (row != null) {
          const nextPos = hasServerPos ? spreadListPosForIndex(i) : row.pos;
          listsById[id] = {
            ...row,
            position: i,
            ...(nextPos !== undefined ? { pos: nextPos } : {}),
          };
        }
      }
      const nextOrder = mergeServerListOrderWithLocalLists(orderedListIds, listsById);
      return { listsById, orderedListIds: nextOrder, cardsVersion: s.cardsVersion + 1 };
    });
  },

  applyListsBulkPositionPatch: (orderedListIds, orderedPos, serverTs) => {
    const marker =
      typeof serverTs === 'number' && Number.isFinite(serverTs) ? serverTs : Date.now();
    set((s) => {
      if (s.activeBoardId == null) {
        return s;
      }
      const listsById = { ...s.listsById };
      const hasServerPos =
        orderedPos != null &&
        orderedPos.length === orderedListIds.length &&
        orderedPos.every((p) => typeof p === 'number' && Number.isFinite(p));
      for (let i = 0; i < orderedListIds.length; i += 1) {
        const id = orderedListIds[i];
        const row = listsById[id];
        if (row == null) {
          continue;
        }
        const pos = hasServerPos ? orderedPos[i]! : spreadListPosForIndex(i);
        if (row.position !== i || row.pos !== pos) {
          listsById[id] = { ...row, position: i, pos };
        }
      }
      const nextOrder = mergeServerListOrderWithLocalLists(orderedListIds, listsById);
      const lastListsPositionServerTs =
        s.lastListsPositionServerTs == null
          ? marker
          : Math.max(s.lastListsPositionServerTs, marker);
      return {
        listsById,
        orderedListIds: nextOrder,
        cardsVersion: s.cardsVersion + 1,
        lastListsPositionServerTs,
      };
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
        const { color: _c, ...withoutColor } = row;
        listsById[id] =
          colorTrimmed === '' ? withoutColor : { ...row, color: colorTrimmed };
      }
      return { listsById, cardsVersion: s.cardsVersion + 1 };
    });
  },
});
