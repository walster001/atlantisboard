import { db, type BoardDB, type CardDB, type ListDB } from './database.js';
import { mergeDexieCardIfSnapshot } from '../utils/transform.js';

/**
 * Background Dexie persistence for board/list/card — not read for active Kanban rendering.
 */
export async function persistBoardSnapshotToDexie(params: {
  readonly board: BoardDB;
  readonly lists: readonly ListDB[];
  readonly cards: readonly CardDB[];
}): Promise<void> {
  const { board, lists, cards } = params;
  try {
    await db.boards.put(board);
    await Promise.all(lists.map((l) => db.lists.put(l)));
    const ids = cards.map((c) => c.id);
    const existingRows = ids.length > 0 ? await db.cards.bulkGet(ids) : [];
    const merged = cards.map((incoming, i) =>
      mergeDexieCardIfSnapshot(incoming as unknown, existingRows[i] ?? undefined, incoming),
    );
    if (merged.length > 0) {
      await db.cards.bulkPut(merged);
    }
  } catch {
    /* cache write is best-effort */
  }
}

export async function persistDexieCardPut(card: CardDB): Promise<void> {
  try {
    const existing = await db.cards.get(card.id);
    const merged = mergeDexieCardIfSnapshot(card as unknown, existing ?? undefined, card);
    await db.cards.put(merged);
  } catch {
    /* noop */
  }
}

export async function persistDexieListPut(list: ListDB): Promise<void> {
  try {
    await db.lists.put(list);
  } catch {
    /* noop */
  }
}

export async function persistDexieBoardPut(board: BoardDB): Promise<void> {
  try {
    await db.boards.put(board);
  } catch {
    /* noop */
  }
}

export async function persistDexieCardsBulk(cards: readonly CardDB[]): Promise<void> {
  if (cards.length === 0) {
    return;
  }
  try {
    const ids = cards.map((c) => c.id);
    const existingRows = await db.cards.bulkGet(ids);
    const merged = cards.map((incoming, i) =>
      mergeDexieCardIfSnapshot(incoming as unknown, existingRows[i] ?? undefined, incoming),
    );
    await db.cards.bulkPut(merged);
  } catch {
    /* noop */
  }
}

export async function persistDexieListDelete(listId: string): Promise<void> {
  try {
    await db.cards.where('listId').equals(listId).delete();
    await db.lists.delete(listId);
  } catch {
    /* noop */
  }
}

export async function persistDexieCardDelete(cardId: string): Promise<void> {
  try {
    await db.cards.delete(cardId);
  } catch {
    /* noop */
  }
}
