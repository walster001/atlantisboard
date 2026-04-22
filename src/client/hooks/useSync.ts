import { useCallback } from 'react';
import { api } from '../utils/api.js';
import { db, type BoardDB, type CardDB, type WorkspaceDB } from '../store/database.js';
import {
  transformBoard,
  transformWorkspace,
  transformList,
  transformCard,
  mergeDexieCardIfSnapshot,
} from '../utils/transform.js';
import { replaceDexieWorkspacesFromHomeApiList } from '../utils/workspaceDexieReconcile.js';
import { resyncWorkspaceSocketRoomsFromDexie } from './useSocket.js';
const WORKSPACE_BOARDS_PAGE_SIZE = 100;

/**
 * Hook to sync data from API to Dexie.js
 */
export function useSync() {
  const syncWorkspaces = useCallback(
    async (options?: { readonly fields?: readonly string[] }): Promise<WorkspaceDB[] | null> => {
      try {
        const response = await api.getWorkspaces({
          view: 'summary',
          ...(options?.fields != null && options.fields.length > 0
            ? { fields: options.fields }
            : {}),
        });
        const rawWorkspaces = (response as { workspaces: unknown[] }).workspaces;
        const workspaces = rawWorkspaces.map(transformWorkspace);
        await replaceDexieWorkspacesFromHomeApiList(workspaces);
        void resyncWorkspaceSocketRoomsFromDexie();
        return workspaces;
      } catch {
        return null;
      }
    },
    [],
  );

  const syncBoards = useCallback(async (workspaceId: string) => {
    try {
      const boards: BoardDB[] = [];
      let skip = 0;
      for (;;) {
        const response = await api.getBoardsByWorkspace(workspaceId, {
          view: 'summary',
          skip,
          limit: WORKSPACE_BOARDS_PAGE_SIZE,
        });
        const rawBoards = response.boards;
        boards.push(...rawBoards.map(transformBoard));
        if (response.hasMore !== true || rawBoards.length < WORKSPACE_BOARDS_PAGE_SIZE) {
          break;
        }
        skip += WORKSPACE_BOARDS_PAGE_SIZE;
      }

      if (boards.length > 0) {
        await db.boards.bulkPut(boards);
      }
    } catch {
      /* sync failed */
    }
  }, []);

  const syncLists = useCallback(async (boardId: string) => {
    try {
      const response = await api.getListsByBoard(boardId);
      const rawLists = (response as { lists: unknown[] }).lists;
      
      // Transform lists from API format (_id) to Dexie format (id)
      const lists = rawLists.map(transformList);
      
      if (lists.length > 0) {
        await db.lists.bulkPut(lists);
      }
    } catch {
      /* sync failed */
    }
  }, []);

  const syncCards = useCallback(async (listId: string) => {
    try {
      const response = await api.getCardsByList(listId, { view: 'summary' });
      const rawCards = (response as { cards: unknown[] }).cards;

      const incomings = rawCards.map((raw) => transformCard(raw) as CardDB);
      const ids = incomings.map((c) => c.id);
      const existingRows = ids.length > 0 ? await db.cards.bulkGet(ids) : [];
      const cards = rawCards.map((raw, i) =>
        mergeDexieCardIfSnapshot(raw, existingRows[i] ?? undefined, incomings[i]),
      );
      if (cards.length > 0) {
        await db.cards.bulkPut(cards);
      }
    } catch {
      /* sync failed */
    }
  }, []);

  return {
    syncWorkspaces,
    syncBoards,
    syncLists,
    syncCards,
  };
}
