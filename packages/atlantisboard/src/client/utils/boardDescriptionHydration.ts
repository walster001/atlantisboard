import { api } from './api.js';
import { extractMongoStringId } from './transform.js';

export const CARD_DESCRIPTION_BATCH_SIZE = 120;
export const DESCRIPTION_FETCH_CONCURRENCY = 4;

export function collectCardIdsFromSnapshot(
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

export type DescriptionPatch = Readonly<{
  id: string;
  description: string;
  descriptionHtml?: string;
}>;

async function hydrateOneDescriptionBatch(
  boardId: string,
  slice: readonly string[],
  onPatches: (patches: readonly DescriptionPatch[]) => void,
): Promise<void> {
  if (slice.length === 0) {
    return;
  }
  try {
    const res = await api.postBoardCardDescriptionsBatch(boardId, slice);
    const rows = res.cards;
    if (rows.length === 0) {
      return;
    }
    onPatches(rows);
  } catch {
    /* description hydration is optional */
  }
}

/**
 * Fetches description HTML/text in batches. Does not read Dexie — caller supplies patches to runtime + cache.
 */
export async function hydrateBoardCardDescriptionsRemote(
  boardId: string,
  cardIds: readonly string[],
  onPatches: (patches: readonly DescriptionPatch[]) => void,
): Promise<void> {
  const chunks: string[][] = [];
  for (let i = 0; i < cardIds.length; i += CARD_DESCRIPTION_BATCH_SIZE) {
    const part = cardIds.slice(i, i + CARD_DESCRIPTION_BATCH_SIZE);
    if (part.length > 0) {
      chunks.push(part);
    }
  }
  for (let i = 0; i < chunks.length; i += DESCRIPTION_FETCH_CONCURRENCY) {
    const parallel = chunks.slice(i, i + DESCRIPTION_FETCH_CONCURRENCY);
    await Promise.all(parallel.map((c) => hydrateOneDescriptionBatch(boardId, c, onPatches)));
  }
}
