import { db, type CardDB, type ListDB } from '../store/database.js';

/** Parallel Dexie reads — same shape KanbanView expects for column card arrays. */
export async function loadKanbanCardsMapFromDexie(
  listsToLoad: readonly ListDB[],
): Promise<Map<string, CardDB[]>> {
  const entries = await Promise.all(
    listsToLoad.map(async (list) => {
      const listCards = await db.cards.where('listId').equals(list.id).sortBy('position');
      return [list.id, listCards] as const;
    }),
  );
  return new Map(entries);
}
