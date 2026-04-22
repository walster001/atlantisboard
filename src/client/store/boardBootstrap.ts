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

/**
 * Loads board + kanban snapshot from API, hydrates runtime store once, persists Dexie in background,
 * then hydrates descriptions into the store (no Dexie read for UI).
 */
export async function bootstrapBoardRuntimeFromApi(boardId: string): Promise<boolean> {
  const endBootstrapPerf = markBoardBootstrapStart();
  try {
    const boardResponse = await api.getBoard(boardId, { view: 'summary' });
    const rawBoard = (boardResponse as { board: unknown }).board;
    const board = transformBoard(rawBoard);

    const snapshotResponse = await api.getBoardKanbanSnapshot(boardId);
    const rawLists = snapshotResponse.lists;
    const rawCardsByList = snapshotResponse.cardsByList as Record<string, unknown[]>;
    const lists = rawLists.map(transformList);
    const cardsByList = buildCardsByListFromSnapshot(lists, rawCardsByList);

    const flatCards: CardDB[] = [];
    for (const lid of lists.map((l) => l.id)) {
      flatCards.push(...(cardsByList.get(lid) ?? []));
    }

    useBoardRuntimeStore.getState().hydrateFromSnapshot({
      boardId,
      board,
      lists,
      cardsByList,
    });

    void persistBoardSnapshotToDexie({ board, lists, cards: flatCards });

    const allIds = collectCardIdsFromSnapshot(rawCardsByList, lists.map((l) => l.id));
    void hydrateBoardCardDescriptionsRemote(boardId, allIds, (patches) => {
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
export async function resyncBoardRuntimeFromApi(boardId: string): Promise<boolean> {
  const ok = await bootstrapBoardRuntimeFromApi(boardId);
  return ok;
}
