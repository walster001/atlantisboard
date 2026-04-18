import { useCallback } from 'react';
import { api } from '../utils/api.js';
import { db, type CardDB } from '../store/database.js';
import {
  transformBoard,
  transformWorkspace,
  transformList,
  transformCard,
  mergeDexieCardIfSnapshot,
} from '../utils/transform.js';

/**
 * Hook to sync data from API to Dexie.js
 */
export function useSync() {
  const syncWorkspaces = useCallback(async () => {
    try {
      const response = await api.getWorkspaces({ view: 'summary' });
      const rawWorkspaces = (response as { workspaces: unknown[] }).workspaces;
      
      // Transform workspaces from API format (_id) to Dexie format (id)
      const workspaces = rawWorkspaces.map(transformWorkspace);
      
      await Promise.all(workspaces.map((workspace) => db.workspaces.put(workspace)));
    } catch {
      /* sync failed */
    }
  }, []);

  const syncBoards = useCallback(async (workspaceId: string) => {
    try {
      const response = await api.getBoardsByWorkspace(workspaceId, { view: 'summary' });
      const rawBoards = (response as { boards: unknown[] }).boards;
      
      // Transform boards from API format (_id) to Dexie format (id)
      const boards = rawBoards.map(transformBoard);
      
      await Promise.all(boards.map((board) => db.boards.put(board)));
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
      
      await Promise.all(lists.map((list) => db.lists.put(list)));
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

  const syncBoardData = useCallback(
    async (
      boardId: string,
      options?: { awaitAllCards?: boolean },
    ): Promise<{ cardsPromise: Promise<void> }> => {
      const awaitAllCards = options?.awaitAllCards !== false;
      try {
        const boardResponse = await api.getBoard(boardId, { view: 'summary' });
        const rawBoard = (boardResponse as { board: unknown }).board;

        const board = transformBoard(rawBoard);
        await db.boards.put(board);

        const snapshotResponse = await api.getBoardKanbanSnapshot(boardId);
        const rawLists = snapshotResponse.lists;
        const rawCardsByList = snapshotResponse.cardsByList;
        const lists = rawLists.map(transformList);
        await Promise.all(lists.map((list) => db.lists.put(list)));

        const cardsPromise = Promise.all(
          lists.map(async (list) => {
            const rawCards = rawCardsByList[list.id] ?? [];
            const incomings = rawCards.map((raw) => transformCard(raw) as CardDB);
            const ids = incomings.map((c) => c.id);
            const existingRows = ids.length > 0 ? await db.cards.bulkGet(ids) : [];
            const cards = rawCards.map((raw, i) =>
              mergeDexieCardIfSnapshot(raw, existingRows[i] ?? undefined, incomings[i]),
            );
            if (cards.length > 0) {
              await db.cards.bulkPut(cards);
            }
          })
        ).then(() => undefined);

        if (awaitAllCards) {
          await cardsPromise;
        }

        return { cardsPromise };
      } catch {
        return { cardsPromise: Promise.resolve() };
      }
    },
    [syncLists, syncCards],
  );

  return {
    syncWorkspaces,
    syncBoards,
    syncLists,
    syncCards,
    syncBoardData,
  };
}
