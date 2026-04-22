import { db, type CardDB, type ListDB } from '../store/database.js';

/** Parallel Dexie reads — same shape KanbanView expects for column card arrays. */
export async function loadKanbanCardsMapFromDexie(
  listsToLoad: readonly ListDB[],
): Promise<Map<string, CardDB[]>> {
  if (listsToLoad.length === 0) {
    return new Map();
  }
  const boardId = listsToLoad[0]!.boardId;
  const sameBoard = listsToLoad.every((l) => l.boardId === boardId);
  if (!sameBoard) {
    const entries = await db.transaction('r', db.cards, () =>
      Promise.all(
        listsToLoad.map(async (list) => {
          const listCards = await db.cards
            .where('listId')
            .equals(list.id)
            .sortBy('position');
          return [list.id, listCards] as const;
        }),
      ),
    );
    return new Map(entries);
  }

  const entries = await db.transaction('r', db.cards, async () => {
    const all = await db.cards.where('boardId').equals(boardId).toArray();
    const byList = new Map<string, CardDB[]>();
    for (const list of listsToLoad) {
      byList.set(list.id, []);
    }
    for (const card of all) {
      const bucket = byList.get(card.listId);
      if (bucket != null) {
        bucket.push(card);
      }
    }
    for (const list of listsToLoad) {
      const arr = byList.get(list.id);
      if (arr != null) {
        arr.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
      }
    }
    return listsToLoad.map((list) => [list.id, byList.get(list.id) ?? []] as const);
  });
  return new Map(entries);
}
