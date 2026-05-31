import type { StateCreator } from 'zustand';
import type { ListDB } from '../database.js';
import {
  emptyBoardRuntimeSlice,
  rebuildAllCardIdsByList,
  type BoardRuntimeStore,
} from './types.js';

export const createBoardActiveContextSlice: StateCreator<
  BoardRuntimeStore,
  [],
  [],
  Pick<
    BoardRuntimeStore,
    'clear' | 'beginHydration' | 'hydrateFromSnapshot' | 'resyncFullSnapshot' | 'commitBoard' | 'applyBoardSettingsLivePatch'
  >
> = (set, get) => ({
  clear: () => {
    set(emptyBoardRuntimeSlice);
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
      lastListsPositionServerTs: null,
    }));
  },

  hydrateFromSnapshot: ({ boardId, board, lists, cardsByList }) => {
    const listsById: Record<string, ListDB> = {};
    for (const l of lists) {
      listsById[l.id] = l;
    }
    const orderedListIds = [...lists].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).map((l) => l.id);
    const cardsById: Record<string, import('../database.js').CardDB> = {};
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
      lastListsPositionServerTs: null,
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

  applyBoardSettingsLivePatch: (patch) => {
    set((s) => {
      if (s.board == null) {
        return s;
      }
      const { memberActivityLogRetentionDays: retentionPatch, ...restPatch } = patch;
      const nextSettings: import('../database.js').BoardDB['settings'] = { ...s.board.settings, ...restPatch };
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
});
