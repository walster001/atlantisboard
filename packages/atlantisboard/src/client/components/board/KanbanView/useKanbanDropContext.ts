import { useLayoutEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { BoardDB, CardDB, ListDB } from '../../../store/database.js';
import { buildKanbanCardsMapFromRuntimeState, useBoardRuntimeStore } from '../../../store/boardRuntimeStore.js';
import type { KanbanPragmaticCtx } from '../useKanbanPragmaticDnd/types.js';
import type { CardDropIndicatorTarget } from '../VirtualizedCardList.js';

interface UseKanbanDropContextArgs {
  readonly board: BoardDB;
  readonly lists: ListDB[];
  readonly cardIdToListIdRef: MutableRefObject<Map<string, string>>;
  readonly setLists: Dispatch<SetStateAction<ListDB[]>>;
  readonly setCards: Dispatch<SetStateAction<Map<string, CardDB[]>>>;
  readonly reloadAllCardsFromDb: () => Promise<void>;
  readonly queueCardDropIndicator: (next: CardDropIndicatorTarget | null) => void;
  readonly flushCardDropIndicatorNow: (next: CardDropIndicatorTarget | null) => void;
  readonly viewAliveRef: MutableRefObject<boolean>;
}

export function useKanbanDropContext({
  board,
  lists,
  cardIdToListIdRef,
  setLists,
  setCards,
  reloadAllCardsFromDb,
  queueCardDropIndicator,
  flushCardDropIndicatorNow,
  viewAliveRef,
}: UseKanbanDropContextArgs): MutableRefObject<KanbanPragmaticCtx> {
  const cardsForDragSnapshot = buildKanbanCardsMapFromRuntimeState(useBoardRuntimeStore.getState());
  const kanbanDropCtxRef = useRef<KanbanPragmaticCtx>({
    board,
    lists,
    cards: cardsForDragSnapshot,
    cardIdToListIdRef,
    setLists,
    setCards,
    reloadAllCardsFromDb,
    queueCardDropIndicator,
    flushCardDropIndicatorNow,
    viewAliveRef,
  });
  kanbanDropCtxRef.current = {
    board,
    lists,
    cards: cardsForDragSnapshot,
    cardIdToListIdRef,
    setLists,
    setCards,
    reloadAllCardsFromDb,
    queueCardDropIndicator,
    flushCardDropIndicatorNow,
    viewAliveRef,
  };

  useLayoutEffect(() => {
    let syncRafId: number | null = null;
    const rebuildCardIdIndex = (map: ReadonlyMap<string, readonly CardDB[]>) => {
      const m = new Map<string, string>();
      for (const [listId, listCards] of map) {
        for (const card of listCards) {
          m.set(card.id, listId);
        }
      }
      cardIdToListIdRef.current = m;
    };
    const syncDragCardsFromStore = () => {
      const map = buildKanbanCardsMapFromRuntimeState(useBoardRuntimeStore.getState());
      kanbanDropCtxRef.current = {
        ...kanbanDropCtxRef.current,
        cards: map,
      };
      rebuildCardIdIndex(map);
    };
    const scheduleSyncDragCardsFromStore = (): void => {
      if (syncRafId != null) {
        return;
      }
      syncRafId = window.requestAnimationFrame(() => {
        syncRafId = null;
        syncDragCardsFromStore();
      });
    };
    syncDragCardsFromStore();
    const unsub = useBoardRuntimeStore.subscribe((state, prev) => {
      if (
        state.cardsVersion !== prev.cardsVersion ||
        state.orderedListIds !== prev.orderedListIds ||
        state.activeBoardId !== prev.activeBoardId
      ) {
        scheduleSyncDragCardsFromStore();
      }
    });
    return () => {
      unsub();
      if (syncRafId != null) {
        window.cancelAnimationFrame(syncRafId);
      }
    };
  }, [cardIdToListIdRef]);

  return kanbanDropCtxRef;
}
