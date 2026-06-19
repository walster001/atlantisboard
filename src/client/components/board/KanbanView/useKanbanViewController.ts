import {
  useState,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { ListDB, CardDB, BoardDB } from '../../../store/database.js';
import { getBoardListColumnWidthChrome } from '../../../utils/boardListColumnWidth.js';
import type { CardDropIndicatorTarget } from '../VirtualizedCardList.js';
import { getKanbanCardListMaxBodyPx } from '../kanbanCardListLayout.js';
import { useKanbanPragmaticDnd } from '../useKanbanPragmaticDnd.js';
import {
  useBoardRuntimeStore,
  boardRuntimeApplySetCardsFromUpdater,
} from '../../../store/boardRuntimeStore.js';
import { useBoardAssigneeDirectory } from '../../../hooks/useBoardAssigneeDirectory.js';
import type { KanbanBoardEditCaps } from '../../../hooks/useBoardPermissions.js';
import { compareBoardListOrder } from '../../../../shared/utils/listPos.js';
import {
  type ListDropIndicatorTarget,
} from './helpers.js';
import {
  handleCardCreatedInRuntime,
  handleListCreatedInRuntime,
  handleListUpdatedInRuntime,
  patchCardInRuntime,
  reloadBoardCardsIfAlive,
  removeCardFromRuntime,
} from './kanbanViewStoreActions.js';
import { useKanbanDropIndicators } from './useKanbanDropIndicators.js';
import { useKanbanDropContext } from './useKanbanDropContext.js';
import { useKanbanHorizontalVirtualization } from './useKanbanHorizontalVirtualization.js';
import type { ResponsiveTier } from '../../../hooks/useResponsiveTier.js';

interface KanbanViewControllerArgs {
  readonly board: BoardDB;
  readonly boardCardPatchRef?: MutableRefObject<((card: CardDB) => void) | null>;
  readonly kanbanCaps: KanbanBoardEditCaps;
  /** `mobile` uses Swiper carousel; `tablet` / `desktop` use horizontal scroll virtualization. */
  readonly responsiveTier: ResponsiveTier;
  readonly carouselEdgeBumpRef?: MutableRefObject<((clientX: number) => void) | null>;
}

interface KanbanViewController {
  readonly assigneeDirectory: ReturnType<typeof useBoardAssigneeDirectory>;
  readonly draggingCardId: string | null;
  readonly draggingListId: string | null;
  readonly addListComposerOpen: boolean;
  readonly setAddListComposerOpen: Dispatch<SetStateAction<boolean>>;
  readonly cardListMaxBodyPx: number;
  readonly cardDropIndicator: CardDropIndicatorTarget | null;
  readonly listDropIndicator: ListDropIndicatorTarget | null;
  readonly suppressCardOpenClickRef: MutableRefObject<boolean>;
  readonly mountedLists: ListDB[];
  readonly leftSpacerPx: number;
  readonly rightSpacerPx: number;
  readonly visibleEnd: number;
  readonly totalListCount: number;
  readonly listColumnChrome: ReturnType<typeof getBoardListColumnWidthChrome>;
  readonly getNextListPosition: () => number;
  readonly closeAddListComposer: () => void;
  readonly openAddListComposer: () => void;
  readonly setColumnsGroupRef: (node: HTMLDivElement | null) => void;
  readonly handleColumnsClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
  readonly handleCardCreated: (listId: string, card: CardDB) => void;
  readonly handleListCreated: (response?: { list: unknown }) => void;
  readonly handleListUpdated: () => Promise<void>;
  readonly patchCardInBoardState: (card: CardDB) => void;
  readonly removeCardFromBoardState: (cardId: string) => void;
  readonly handleKanbanCardsReload: () => void;
}

export function useKanbanViewController({
  board,
  boardCardPatchRef,
  kanbanCaps,
  responsiveTier,
  carouselEdgeBumpRef,
}: KanbanViewControllerArgs): KanbanViewController {
  const { orderedListIds, listsById } = useBoardRuntimeStore(
    useShallow((state) => ({
      orderedListIds: state.orderedListIds,
      listsById: state.listsById,
    })),
  );
  const lists = useMemo((): ListDB[] => {
    const out: ListDB[] = [];
    for (let i = 0; i < orderedListIds.length; i += 1) {
      const id = orderedListIds[i]!;
      const row = listsById[id];
      if (row != null) {
        out.push(row);
      }
    }
    return out;
  }, [orderedListIds, listsById]);

  const assigneeDirectory = useBoardAssigneeDirectory(board.id);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [draggingListId, setDraggingListId] = useState<string | null>(null);
  const [addListComposerOpen, setAddListComposerOpen] = useState(false);
  const {
    cardDropIndicator,
    listDropIndicator,
    queueCardDropIndicator,
    flushCardDropIndicatorNow,
    setListDropIndicatorIfChanged,
    cancelPendingCardDropIndicatorRaf,
    cardDropIndicatorRef,
  } = useKanbanDropIndicators();
  const canAddCardRef = useRef(kanbanCaps.canAddCard);
  canAddCardRef.current = kanbanCaps.canAddCard;
  const [cardListMaxBodyPx, setCardListMaxBodyPx] = useState(() =>
    getKanbanCardListMaxBodyPx(kanbanCaps.canAddCard),
  );

  const viewAliveRef = useRef(true);
  const listsRef = useRef(lists);
  listsRef.current = lists;
  const cardIdToListIdRef = useRef<Map<string, string>>(new Map());

  useLayoutEffect(() => {
    setCardListMaxBodyPx(getKanbanCardListMaxBodyPx(kanbanCaps.canAddCard));
  }, [kanbanCaps.canAddCard]);

  useLayoutEffect(() => {
    const ac = new AbortController();
    const { signal } = ac;
    let rafId: number | null = null;
    const schedule = (): void => {
      if (rafId != null) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setCardListMaxBodyPx(getKanbanCardListMaxBodyPx(canAddCardRef.current));
      });
    };
    window.addEventListener('resize', schedule, { signal });
    globalThis.window.visualViewport?.addEventListener('resize', schedule, { signal });
    return () => {
      ac.abort();
      if (rafId != null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    viewAliveRef.current = true;
    return () => {
      cancelPendingCardDropIndicatorRaf();
      viewAliveRef.current = false;
      if (timeoutRef.current != null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [cancelPendingCardDropIndicatorRaf]);

  const reloadAllCardsFromDb = useCallback(async () => {
    await reloadBoardCardsIfAlive(board.id, viewAliveRef);
  }, [board.id]);

  const handleKanbanCardsReload = useCallback(() => {
    void reloadAllCardsFromDb();
  }, [reloadAllCardsFromDb]);

  const patchCardInBoardState = useCallback((updated: CardDB) => {
    patchCardInRuntime(updated);
  }, []);

  useLayoutEffect(() => {
    const ref = boardCardPatchRef;
    if (ref == null) {
      return undefined;
    }
    ref.current = patchCardInBoardState;
    return () => {
      ref.current = null;
    };
  }, [boardCardPatchRef, patchCardInBoardState]);

  const removeCardFromBoardState = useCallback((cardId: string) => {
    removeCardFromRuntime(cardId);
  }, []);

  const handleListCreated = useCallback(
    (response?: { list: unknown }) => {
      handleListCreatedInRuntime({ boardId: board.id, response, viewAliveRef, timeoutRef, listsRef });
    },
    [board.id],
  );

  const handleCardCreated = useCallback((_listId: string, newCard: CardDB) => {
    handleCardCreatedInRuntime(viewAliveRef, newCard);
  }, []);

  const handleListUpdated = useCallback(async () => {
    await handleListUpdatedInRuntime(board.id, viewAliveRef);
  }, [board.id]);

  const getNextListPosition = useCallback((): number => listsRef.current.length, []);

  const listColumnChrome = useMemo(
    () => getBoardListColumnWidthChrome(board),
    [board],
  );

  const closeAddListComposer = useCallback((): void => {
    setAddListComposerOpen(false);
  }, []);

  const openAddListComposer = useCallback((): void => {
    setAddListComposerOpen(true);
  }, []);

  useLayoutEffect(() => {
    if (!kanbanCaps.canAddList && addListComposerOpen) {
      setAddListComposerOpen(false);
    }
  }, [kanbanCaps.canAddList, addListComposerOpen]);

  const setListsCompat = useCallback((action: SetStateAction<ListDB[]>) => {
    const state = useBoardRuntimeStore.getState();
    const prev = state.orderedListIds
      .map((id) => state.listsById[id])
      .filter((row): row is ListDB => row != null)
      .sort((a, b) => compareBoardListOrder(a, b));
    const next = typeof action === 'function' ? (action as (p: ListDB[]) => ListDB[])(prev) : action;
    useBoardRuntimeStore.getState().setListsFromArray(next);
  }, []);

  const setCardsCompat = useCallback((action: SetStateAction<Map<string, CardDB[]>>) => {
    if (typeof action === 'function') {
      boardRuntimeApplySetCardsFromUpdater(action as (p: Map<string, CardDB[]>) => Map<string, CardDB[]>);
    } else {
      boardRuntimeApplySetCardsFromUpdater(() => action);
    }
  }, []);

  const kanbanDropCtxRef = useKanbanDropContext({
    board,
    lists,
    cardIdToListIdRef,
    setLists: setListsCompat,
    setCards: setCardsCompat,
    reloadAllCardsFromDb,
    queueCardDropIndicator,
    flushCardDropIndicatorNow,
    cardDropIndicatorRef,
    viewAliveRef,
  });

  const suppressCardOpenClickRef = useRef(false);
  const {
    mountedLists,
    leftSpacerPx,
    rightSpacerPx,
    visibleEnd,
    totalListCount,
    columnsGroupRef,
    handleColumnsClickCapture,
    setColumnsGroupRef,
  } = useKanbanHorizontalVirtualization({
    board,
    lists,
    suppressCardOpenClickRef,
    enabled: responsiveTier !== 'mobile',
  });

  useKanbanPragmaticDnd({
    kanbanDropCtxRef,
    setDraggingCardId,
    setDraggingListId,
    setListDropIndicatorIfChanged,
    ...(carouselEdgeBumpRef != null ? { carouselEdgeBumpRef } : {}),
  });

  useLayoutEffect(() => {
    const root = columnsGroupRef.current?.closest('.board-page');
    if (!(root instanceof HTMLElement)) {
      return undefined;
    }
    const dragging = draggingCardId != null || draggingListId != null;
    root.classList.toggle('board-page--kanban-dragging', dragging);
    return () => {
      root.classList.remove('board-page--kanban-dragging');
    };
  }, [columnsGroupRef, draggingCardId, draggingListId]);

  return {
    assigneeDirectory,
    draggingCardId,
    draggingListId,
    addListComposerOpen,
    setAddListComposerOpen,
    cardListMaxBodyPx,
    cardDropIndicator,
    listDropIndicator,
    suppressCardOpenClickRef,
    mountedLists,
    leftSpacerPx,
    rightSpacerPx,
    visibleEnd,
    totalListCount,
    listColumnChrome,
    getNextListPosition,
    closeAddListComposer,
    openAddListComposer,
    setColumnsGroupRef,
    handleColumnsClickCapture,
    handleCardCreated,
    handleListCreated,
    handleListUpdated,
    patchCardInBoardState,
    removeCardFromBoardState,
    handleKanbanCardsReload,
  };
}
