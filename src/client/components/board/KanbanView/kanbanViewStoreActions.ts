import type { MutableRefObject } from 'react';
import type { CardDB, ListDB } from '../../../store/database.js';
import { api } from '../../../utils/api.js';
import { transformList } from '../../../utils/transform.js';
import { useBoardRuntimeStore } from '../../../store/boardRuntimeStore.js';
import { resyncBoardRuntimeFromApi } from '../../../store/boardBootstrap.js';
import { persistDexieCardPut, persistDexieListPut } from '../../../store/boardDexieCache.js';

export async function reloadBoardCardsIfAlive(
  boardId: string,
  viewAliveRef: MutableRefObject<boolean>,
): Promise<void> {
  if (!viewAliveRef.current) {
    return;
  }
  await resyncBoardRuntimeFromApi(boardId);
}

export function patchCardInRuntime(updated: CardDB): void {
  const found = useBoardRuntimeStore.getState().cardsById[updated.id];
  if (found == null) {
    void resyncBoardRuntimeFromApi(updated.boardId);
    return;
  }
  useBoardRuntimeStore.getState().upsertCard(updated);
}

export function removeCardFromRuntime(cardId: string): void {
  useBoardRuntimeStore.getState().removeCard(cardId);
}

export function handleCardCreatedInRuntime(viewAliveRef: MutableRefObject<boolean>, newCard: CardDB): void {
  if (!viewAliveRef.current) {
    return;
  }
  useBoardRuntimeStore.getState().upsertCard(newCard);
  void persistDexieCardPut(newCard);
}

export async function handleListUpdatedInRuntime(
  boardId: string,
  viewAliveRef: MutableRefObject<boolean>,
): Promise<void> {
  if (!viewAliveRef.current) {
    return;
  }
  try {
    const apiResponse = await api.getListsByBoard(boardId);
    const rawLists = (apiResponse as { lists: unknown[] }).lists;
    const transformedLists = rawLists.map(transformList);
    if (viewAliveRef.current) {
      useBoardRuntimeStore.getState().setListsFromArray(transformedLists);
    }
    await Promise.all(transformedLists.map((entry) => persistDexieListPut(entry)));
  } catch {
    /* noop */
  }
}

export function handleListCreatedInRuntime(args: {
  readonly boardId: string;
  readonly response: { list: unknown } | undefined;
  readonly viewAliveRef: MutableRefObject<boolean>;
  readonly timeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  readonly listsRef: MutableRefObject<ListDB[]>;
}): void {
  const { boardId, response, viewAliveRef, timeoutRef, listsRef } = args;
  if (!viewAliveRef.current) {
    return;
  }
  if (response?.list) {
    const newList = transformList(response.list);
    if (viewAliveRef.current) {
      useBoardRuntimeStore.getState().upsertList(newList);
    }
    void persistDexieListPut(newList);
    return;
  }
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
  }
  const lengthBefore = listsRef.current.length;
  timeoutRef.current = setTimeout(async () => {
    if (!viewAliveRef.current) {
      timeoutRef.current = null;
      return;
    }
    const state = useBoardRuntimeStore.getState();
    let updatedLists: ListDB[] = state.orderedListIds
      .map((id) => state.listsById[id])
      .filter((entry): entry is ListDB => entry != null);
    if (updatedLists.length === lengthBefore) {
      try {
        const apiResponse = await api.getListsByBoard(boardId);
        const rawLists = (apiResponse as { lists: unknown[] }).lists;
        const transformedLists = rawLists.map(transformList);
        await Promise.all(transformedLists.map((entry) => persistDexieListPut(entry)));
        updatedLists = transformedLists;
      } catch {
        /* API fetch failed */
      }
    }
    if (viewAliveRef.current) {
      useBoardRuntimeStore.getState().setListsFromArray(updatedLists);
    }
    timeoutRef.current = null;
  }, 200);
}
