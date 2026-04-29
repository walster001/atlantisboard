import { api } from '../utils/api.js';
import {
  transformBoard,
  transformList,
  transformCard,
  mergeDexieCardIfSnapshot,
} from '../utils/transform.js';
import type { CardDB, ListDB } from './database.js';
import { db } from './database.js';
import { useBoardRuntimeStore } from './boardRuntimeStore.js';
import { persistBoardSnapshotToDexie } from './boardDexieCache.js';
import {
  collectCardIdsFromSnapshot,
  hydrateBoardCardDescriptionsRemote,
} from '../utils/boardDescriptionHydration.js';
import { markBoardBootstrapStart } from '../perf/boardPerf.js';

function buildCardsByListFromSnapshot(
  lists: readonly ListDB[],
  rawCardsByList: Record<string, unknown[]>,
): Map<string, CardDB[]> {
  const map = new Map<string, CardDB[]>();
  for (const list of lists) {
    const rawCards = rawCardsByList[list.id] ?? [];
    const cards: CardDB[] = rawCards.map((raw) => {
      const incoming = transformCard(raw) as CardDB;
      return mergeDexieCardIfSnapshot(raw, undefined, incoming);
    });
    map.set(list.id, cards);
  }
  return map;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

async function hydrateCardsInBatches(
  boardId: string,
  lists: readonly ListDB[],
  rawCardsByList: Record<string, unknown[]>,
  signal?: AbortSignal,
): Promise<Map<string, CardDB[]>> {
  const BATCH_LIST_COUNT = 4;
  const cardsByList = new Map<string, CardDB[]>();
  for (let i = 0; i < lists.length; i += BATCH_LIST_COUNT) {
    if (signal?.aborted === true || useBoardRuntimeStore.getState().activeBoardId !== boardId) {
      return cardsByList;
    }
    const chunk = lists.slice(i, i + BATCH_LIST_COUNT);
    const partial = new Map<string, CardDB[]>();
    for (const list of chunk) {
      const rawCards = rawCardsByList[list.id] ?? [];
      const cards: CardDB[] = rawCards.map((raw) => {
        const incoming = transformCard(raw) as CardDB;
        return mergeDexieCardIfSnapshot(raw, undefined, incoming);
      });
      partial.set(list.id, cards);
      cardsByList.set(list.id, cards);
    }
    useBoardRuntimeStore.getState().applyKanbanCardsMapPartial(partial);
    await nextFrame();
  }
  return cardsByList;
}

async function fetchBoardSnapshotWindowed(
  boardId: string,
  options?: {
    readonly listLimit?: number;
    readonly signal?: AbortSignal;
  },
): Promise<{
  readonly combinedLists: unknown[];
  readonly combinedCardsByList: Record<string, unknown[]>;
}> {
  const first = await api.getBoardKanbanSnapshot(
    boardId,
    typeof options?.listLimit === 'number' ? { listLimit: options.listLimit } : undefined,
  );
  const combinedLists = [...first.lists];
  const combinedCardsByList: Record<string, unknown[]> = { ...first.cardsByList };
  let nextCursor = first.nextListCursor;
  let hasMore = first.hasMoreLists === true;
  let pagesRead = 1;
  const MAX_PAGES = 20;
  while (
    hasMore &&
    typeof nextCursor === 'string' &&
    nextCursor.trim() !== '' &&
    pagesRead < MAX_PAGES &&
    options?.signal?.aborted !== true
  ) {
    const page = await api.getBoardKanbanSnapshot(boardId, {
      ...(typeof options?.listLimit === 'number' ? { listLimit: options.listLimit } : {}),
      listCursor: nextCursor,
    });
    for (const list of page.lists) {
      combinedLists.push(list);
    }
    for (const [listId, cards] of Object.entries(page.cardsByList)) {
      combinedCardsByList[listId] = cards;
    }
    nextCursor = page.nextListCursor;
    hasMore = page.hasMoreLists === true;
    pagesRead += 1;
  }
  return {
    combinedLists,
    combinedCardsByList,
  };
}

/**
 * Loads board + kanban snapshot from API, hydrates runtime store once, persists Dexie in background,
 * then hydrates descriptions into the store (no Dexie read for UI).
 */
export async function bootstrapBoardRuntimeFromApi(
  boardId: string,
  options?: {
    readonly signal?: AbortSignal;
    readonly staged?: boolean;
    readonly listLimit?: number;
    readonly hydrateDescriptions?: 'all' | 'viewport';
  },
): Promise<boolean> {
  const endBootstrapPerf = markBoardBootstrapStart();
  const signal = options?.signal;
  try {
    const [boardResponse, snapshotResponse] = await Promise.all([
      api.getBoard(boardId, { view: 'summary' }),
      fetchBoardSnapshotWindowed(boardId, {
        ...(typeof options?.listLimit === 'number' ? { listLimit: options.listLimit } : {}),
        ...(signal !== undefined ? { signal } : {}),
      }),
    ]);
    if (signal?.aborted === true) {
      endBootstrapPerf();
      return false;
    }
    const rawBoard = (boardResponse as { board: unknown }).board;
    const board = transformBoard(rawBoard);
    const rawLists = snapshotResponse.combinedLists;
    const rawCardsByList = snapshotResponse.combinedCardsByList;
    const lists = rawLists.map(transformList);
    const staged = options?.staged === true;
    let cardsByList: Map<string, CardDB[]>;
    if (staged) {
      useBoardRuntimeStore.getState().beginHydration({ boardId, board });
      await nextFrame();
      if (options?.signal?.aborted === true || useBoardRuntimeStore.getState().activeBoardId !== boardId) {
        endBootstrapPerf();
        return false;
      }
      useBoardRuntimeStore.getState().setListsFromArray(lists);
      await nextFrame();
      cardsByList = await hydrateCardsInBatches(boardId, lists, rawCardsByList, signal);
    } else {
      cardsByList = buildCardsByListFromSnapshot(lists, rawCardsByList);
      useBoardRuntimeStore.getState().hydrateFromSnapshot({
        boardId,
        board,
        lists,
        cardsByList,
      });
    }

    if (options?.signal?.aborted === true || useBoardRuntimeStore.getState().activeBoardId !== boardId) {
      endBootstrapPerf();
      return false;
    }

    const flatCards: CardDB[] = [];
    for (const lid of lists.map((l) => l.id)) {
      flatCards.push(...(cardsByList.get(lid) ?? []));
    }

    void persistBoardSnapshotToDexie({ board, lists, cards: flatCards });

    const allIds = collectCardIdsFromSnapshot(rawCardsByList, lists.map((l) => l.id));
    const descriptionIds =
      options?.hydrateDescriptions === 'viewport' ? allIds.slice(0, 600) : allIds;
    void hydrateBoardCardDescriptionsRemote(boardId, descriptionIds, (patches) => {
      if (useBoardRuntimeStore.getState().activeBoardId !== boardId) {
        return;
      }
      useBoardRuntimeStore.getState().patchCardsDescription(patches);
      void persistDexieDescriptionPatches(patches);
    });

    endBootstrapPerf();
    return true;
  } catch {
    endBootstrapPerf();
    return false;
  }
}

async function persistDexieDescriptionPatches(
  patches: ReadonlyArray<{ id: string; description: string; descriptionHtml?: string }>,
): Promise<void> {
  try {
    const ids = patches.map((p) => p.id);
    const existingRows = await db.cards.bulkGet(ids);
    const puts: CardDB[] = [];
    for (let j = 0; j < patches.length; j += 1) {
      const ex = existingRows[j];
      if (ex == null) {
        continue;
      }
      const patch = patches[j];
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
    /* optional cache */
  }
}

/** Full resync after duplicate / admin operations — replaces runtime + cache. */
export async function resyncBoardRuntimeFromApi(
  boardId: string,
  options?: { readonly signal?: AbortSignal },
): Promise<boolean> {
  const ok = await bootstrapBoardRuntimeFromApi(boardId, { ...options, staged: false });
  return ok;
}
