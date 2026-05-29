import type { CardDB } from '../store/database.js';
import { useBoardRuntimeStore } from '../store/boardRuntimeStore.js';
import { persistDexieCardPut, persistDexieListPut } from '../store/boardDexieCache.js';
import { normalizeCardFromApi, transformList } from './transform.js';

export interface DuplicateListApplyPayload {
  readonly list: unknown;
  readonly cards: readonly unknown[];
  readonly targetBoardId: string;
}

export function applyDuplicateListToRuntime(
  activeBoardId: string,
  payload: DuplicateListApplyPayload,
): boolean {
  if (payload.targetBoardId !== activeBoardId) {
    return false;
  }

  const list = transformList(payload.list);
  const cards: CardDB[] = [];
  for (const raw of payload.cards) {
    const id =
      raw != null && typeof raw === 'object'
        ? String((raw as { _id?: string; id?: string })._id ?? (raw as { id?: string }).id ?? '').trim()
        : '';
    if (id === '') {
      continue;
    }
    cards.push(normalizeCardFromApi(raw, id));
  }

  const store = useBoardRuntimeStore.getState();
  if (store.activeBoardId !== activeBoardId) {
    return false;
  }

  store.upsertList(list);
  if (cards.length > 0) {
    store.upsertCards(cards);
  }

  void persistDexieListPut(list);
  void Promise.all(cards.map((card) => persistDexieCardPut(card)));

  return true;
}

export function applyDuplicateCardToRuntime(activeBoardId: string, rawCard: unknown): CardDB | null {
  const id =
    rawCard != null && typeof rawCard === 'object'
      ? String((rawCard as { _id?: string; id?: string })._id ?? (rawCard as { id?: string }).id ?? '').trim()
      : '';
  if (id === '') {
    return null;
  }

  const card = normalizeCardFromApi(rawCard, id);
  if (card.boardId !== activeBoardId) {
    return null;
  }

  const store = useBoardRuntimeStore.getState();
  if (store.activeBoardId !== activeBoardId) {
    return null;
  }

  store.upsertCard(card);
  void persistDexieCardPut(card);
  return card;
}
