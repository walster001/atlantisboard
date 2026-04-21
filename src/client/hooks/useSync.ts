import { useCallback } from 'react';
import { api } from '../utils/api.js';
import { db, type BoardDB, type CardDB } from '../store/database.js';
import {
  transformBoard,
  transformWorkspace,
  transformList,
  transformCard,
  mergeDexieCardIfSnapshot,
  extractMongoStringId,
} from '../utils/transform.js';

const WORKSPACE_BOARDS_PAGE_SIZE = 100;
const CARD_DESCRIPTION_BATCH_SIZE = 120;
const DESCRIPTION_FETCH_CONCURRENCY = 4;

function collectCardIdsFromSnapshot(
  cardsByList: Record<string, unknown[]>,
  listIds: readonly string[],
): string[] {
  const out: string[] = [];
  for (const lid of listIds) {
    const rawCards = cardsByList[lid] ?? [];
    for (const raw of rawCards) {
      if (!raw || typeof raw !== 'object') {
        continue;
      }
      const r = raw as { id?: unknown; _id?: unknown };
      const id = extractMongoStringId(r.id) || extractMongoStringId(r._id);
      if (id !== '') {
        out.push(id);
      }
    }
  }
  return out;
}

async function hydrateOneDescriptionBatch(boardId: string, slice: readonly string[]): Promise<void> {
  if (slice.length === 0) {
    return;
  }
  try {
    const res = await api.postBoardCardDescriptionsBatch(boardId, slice);
    const rows = res.cards;
    if (rows.length === 0) {
      return;
    }
    const ids = rows.map((r) => r.id);
    const existingRows = await db.cards.bulkGet(ids);
    const puts: CardDB[] = [];
    for (let j = 0; j < rows.length; j += 1) {
      const ex = existingRows[j];
      if (ex == null) {
        continue;
      }
      const patch = rows[j];
      puts.push({
        ...ex,
        description: patch.description ?? ex.description ?? '',
        ...(patch.descriptionHtml !== undefined ? { descriptionHtml: patch.descriptionHtml } : {}),
      });
    }
    if (puts.length > 0) {
      await db.cards.bulkPut(puts);
    }
  } catch {
    /* description hydration is optional */
  }
}

async function hydrateBoardCardDescriptions(boardId: string, cardIds: readonly string[]): Promise<void> {
  const chunks: string[][] = [];
  for (let i = 0; i < cardIds.length; i += CARD_DESCRIPTION_BATCH_SIZE) {
    const part = cardIds.slice(i, i + CARD_DESCRIPTION_BATCH_SIZE);
    if (part.length > 0) {
      chunks.push(part);
    }
  }
  for (let i = 0; i < chunks.length; i += DESCRIPTION_FETCH_CONCURRENCY) {
    const parallel = chunks.slice(i, i + DESCRIPTION_FETCH_CONCURRENCY);
    await Promise.all(parallel.map((c) => hydrateOneDescriptionBatch(boardId, c)));
  }
}

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
          }),
        )
          .then(async () => {
            const allIds = collectCardIdsFromSnapshot(
              rawCardsByList as Record<string, unknown[]>,
              lists.map((l) => l.id),
            );
            await hydrateBoardCardDescriptions(boardId, allIds);
          })
          .then(() => undefined);

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
