import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
  type ComponentProps,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { Box, Button, Group } from '@mantine/core';
import { useShallow } from 'zustand/react/shallow';
import type { ListDB, CardDB, BoardDB } from '../../store/database.js';
import { api } from '../../utils/api.js';
import { transformList } from '../../utils/transform.js';
import {
  getBoardListColumnWidthChrome,
} from '../../utils/boardListColumnWidth.js';
import { SortableList } from './SortableList.js';
import { BoardInlineListComposer } from './BoardInlineListComposer.js';
import type { CardDropIndicatorTarget } from './VirtualizedCardList.js';
import { getKanbanCardListMaxBodyPx } from './kanbanCardListLayout.js';
import { useKanbanPragmaticDnd } from './useKanbanPragmaticDnd.js';
import {
  useBoardRuntimeStore,
  buildKanbanCardsMapFromRuntimeState,
  boardRuntimeApplySetCardsFromUpdater,
} from '../../store/boardRuntimeStore.js';
import { resyncBoardRuntimeFromApi } from '../../store/boardBootstrap.js';
import { persistDexieListPut, persistDexieCardPut } from '../../store/boardDexieCache.js';
import { useBoardAssigneeDirectory } from '../../hooks/useBoardAssigneeDirectory.js';
import type { KanbanBoardEditCaps } from '../../hooks/useBoardPermissions.js';
import './boardView.css';

const KANBAN_ADD_LIST_BUTTON_STYLES = {
  inner: {
    padding: '11px 16px 11px 14px',
  },
  section: {
    marginInlineEnd: 6,
  },
} as const;

interface ListDropIndicatorTarget {
  readonly overListId: string;
}

/** Layout intent only — boxWidth/boxHeight are display hints and must not trigger re-renders every tick. */
function cardDropIndicatorsEqual(
  a: CardDropIndicatorTarget | null,
  b: CardDropIndicatorTarget | null,
): boolean {
  if (a === b) {
    return true;
  }
  if (a == null || b == null) {
    return a === b;
  }
  return (
    a.listId === b.listId &&
    a.sourceListId === b.sourceListId &&
    a.anchorCardId === b.anchorCardId &&
    a.columnIntent === b.columnIntent
  );
}

interface KanbanViewProps {
  /** Supplied by `BoardPage` so this view does not subscribe separately to `s.board`. */
  board: BoardDB;
  onOpenCard: (card: CardDB) => void;
  /**
   * Assigned to the same patch used for socket `card:updated` so the card detail overlay can
   * refresh list tiles (description, due date, assignees, cover, labels) without waiting for sockets.
   */
  boardCardPatchRef?: MutableRefObject<((card: CardDB) => void) | null>;
  /** List/card menus and add-list/add-card — hidden until loaded, then from granular board keys. */
  kanbanCaps: KanbanBoardEditCaps;
}

export type { KanbanBoardEditCaps };

function listDropIndicatorsEqual(
  a: ListDropIndicatorTarget | null,
  b: ListDropIndicatorTarget | null,
): boolean {
  if (a === b) {
    return true;
  }
  if (a == null || b == null) {
    return a === b;
  }
  return a.overListId === b.overListId;
}

/** One column: subscribes only to that list's cards so remote card updates don't re-render every list. */
type KanbanListColumnProps = Omit<ComponentProps<typeof SortableList>, 'cards'>;

const KanbanListColumn = memo(function KanbanListColumn(props: KanbanListColumnProps) {
  const listId = props.list.id;
  const cards = useBoardRuntimeStore(
    useShallow((s) => {
      const ids = s.cardIdsByListId[listId] ?? [];
      const out: CardDB[] = [];
      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i]!;
        const c = s.cardsById[id];
        if (c != null) {
          out.push(c);
        }
      }
      return out;
    }),
  );
  return <SortableList {...props} cards={cards} />;
});

export function KanbanView({
  board,
  onOpenCard,
  boardCardPatchRef,
  kanbanCaps,
}: KanbanViewProps) {
  const { orderedListIds, listsById } = useBoardRuntimeStore(
    useShallow((s) => ({
      orderedListIds: s.orderedListIds,
      listsById: s.listsById,
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
  const canAddCardRef = useRef(kanbanCaps.canAddCard);
  canAddCardRef.current = kanbanCaps.canAddCard;
  const [cardListMaxBodyPx, setCardListMaxBodyPx] = useState(() =>
    getKanbanCardListMaxBodyPx(kanbanCaps.canAddCard),
  );
  const [cardDropIndicator, setCardDropIndicator] = useState<CardDropIndicatorTarget | null>(null);
  const cardDropIndicatorRef = useRef<CardDropIndicatorTarget | null>(null);
  const [listDropIndicator, setListDropIndicator] = useState<ListDropIndicatorTarget | null>(null);
  const listDropIndicatorRef = useRef<ListDropIndicatorTarget | null>(null);
  const pendingCardDropIndicatorRef = useRef<CardDropIndicatorTarget | null>(null);
  /** One rAF per frame batches pointermove; avoids double-rAF latency on drop hints. */
  const cardDropIndicatorRafRef = useRef<number | null>(null);

  const cancelPendingCardDropIndicatorRaf = useCallback((): void => {
    const id = cardDropIndicatorRafRef.current;
    if (id != null) {
      cancelAnimationFrame(id);
      cardDropIndicatorRafRef.current = null;
    }
  }, []);

  const setCardDropIndicatorIfChanged = useCallback((next: CardDropIndicatorTarget | null) => {
    if (cardDropIndicatorsEqual(cardDropIndicatorRef.current, next)) {
      return;
    }
    cardDropIndicatorRef.current = next;
    setCardDropIndicator(next);
  }, []);

  const setListDropIndicatorIfChanged = useCallback((next: ListDropIndicatorTarget | null) => {
    if (listDropIndicatorsEqual(listDropIndicatorRef.current, next)) {
      return;
    }
    listDropIndicatorRef.current = next;
    setListDropIndicator(next);
  }, []);

  const queueCardDropIndicator = useCallback(
    (next: CardDropIndicatorTarget | null) => {
      pendingCardDropIndicatorRef.current = next;
      if (cardDropIndicatorRafRef.current != null) {
        return;
      }
      cardDropIndicatorRafRef.current = requestAnimationFrame(() => {
        cardDropIndicatorRafRef.current = null;
        setCardDropIndicatorIfChanged(pendingCardDropIndicatorRef.current);
      });
    },
    [setCardDropIndicatorIfChanged, cancelPendingCardDropIndicatorRaf],
  );

  const flushCardDropIndicatorNow = useCallback(
    (next: CardDropIndicatorTarget | null) => {
      cancelPendingCardDropIndicatorRaf();
      pendingCardDropIndicatorRef.current = next;
      setCardDropIndicatorIfChanged(next);
    },
    [setCardDropIndicatorIfChanged],
  );

  /** True only while this view is mounted — never cleared by nested effects (lists/cards load). */
  const viewAliveRef = useRef(true);
  const listsRef = useRef(lists);
  listsRef.current = lists;
  /** O(1) lookup for drop handling — kept in sync with the runtime store (see subscription below). */
  const cardIdToListIdRef = useRef<Map<string, string>>(new Map());
  const columnsGroupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCardListMaxBodyPx(getKanbanCardListMaxBodyPx(kanbanCaps.canAddCard));
  }, [kanbanCaps.canAddCard]);

  useEffect(() => {
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

  useEffect(() => {
    viewAliveRef.current = true;
    return () => {
      cancelPendingCardDropIndicatorRaf();
      viewAliveRef.current = false;
      if (timeoutRef.current != null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const reloadAllCardsFromDb = useCallback(async () => {
    if (!viewAliveRef.current || board == null) {
      return;
    }
    await resyncBoardRuntimeFromApi(board.id);
  }, [board]);

  const handleKanbanCardsReload = useCallback(() => {
    void reloadAllCardsFromDb();
  }, [reloadAllCardsFromDb]);

  const patchCardInBoardState = useCallback(
    (updated: CardDB) => {
      const found = useBoardRuntimeStore.getState().cardsById[updated.id];
      if (found == null) {
        void resyncBoardRuntimeFromApi(updated.boardId);
        return;
      }
      useBoardRuntimeStore.getState().upsertCard(updated);
    },
    [],
  );

  useEffect(() => {
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
    useBoardRuntimeStore.getState().removeCard(cardId);
  }, []);

  const handleListCreated = useCallback(
    (response?: { list: unknown }) => {
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

        const stLists = useBoardRuntimeStore.getState();
        let updatedLists: ListDB[] = stLists.orderedListIds
          .map((id) => stLists.listsById[id])
          .filter((l): l is ListDB => l != null);

        if (updatedLists.length === lengthBefore) {
          try {
            const apiResponse = await api.getListsByBoard(board.id);
            const rawLists = (apiResponse as { lists: unknown[] }).lists;
            const transformedLists = rawLists.map(transformList);
            await Promise.all(transformedLists.map((list) => persistDexieListPut(list)));
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
    },
    [board.id],
  );

  const handleCardCreated = useCallback((_listId: string, newCard: CardDB) => {
    if (!viewAliveRef.current) {
      return;
    }
    useBoardRuntimeStore.getState().upsertCard(newCard);
    void persistDexieCardPut(newCard);
  }, []);

  const handleListUpdated = useCallback(async () => {
    if (!viewAliveRef.current) {
      return;
    }
    const boardId = board.id;
    try {
      const apiResponse = await api.getListsByBoard(boardId);
      const rawLists = (apiResponse as { lists: unknown[] }).lists;
      const transformedLists = rawLists.map(transformList);
      if (viewAliveRef.current) {
        useBoardRuntimeStore.getState().setListsFromArray(transformedLists);
      }
      await Promise.all(transformedLists.map((l) => persistDexieListPut(l)));
    } catch {
      /* noop */
    }
  }, [board.id]);

  const getNextListPosition = useCallback((): number => listsRef.current.length, []);

  const listColumnChrome = useMemo(
    () => getBoardListColumnWidthChrome(board),
    [board.settings.listColumnWidthPx],
  );

  const closeAddListComposer = useCallback((): void => {
    setAddListComposerOpen(false);
  }, []);

  const openAddListComposer = useCallback((): void => {
    setAddListComposerOpen(true);
  }, []);

  useEffect(() => {
    if (!kanbanCaps.canAddList && addListComposerOpen) {
      setAddListComposerOpen(false);
    }
  }, [kanbanCaps.canAddList, addListComposerOpen]);

  const setListsCompat = useCallback((action: SetStateAction<ListDB[]>) => {
    const st = useBoardRuntimeStore.getState();
    const prev = st.orderedListIds
      .map((id) => st.listsById[id])
      .filter((l): l is ListDB => l != null)
      .sort((a, b) => a.position - b.position);
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

  const cardsForDragSnapshot = buildKanbanCardsMapFromRuntimeState(useBoardRuntimeStore.getState());
  const kanbanDropCtxRef = useRef({
    board,
    lists,
    cards: cardsForDragSnapshot,
    cardIdToListIdRef,
    setLists: setListsCompat,
    setCards: setCardsCompat,
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
    setLists: setListsCompat,
    setCards: setCardsCompat,
    reloadAllCardsFromDb,
    queueCardDropIndicator,
    flushCardDropIndicatorNow,
    viewAliveRef,
  };

  useEffect(() => {
    let syncRafId: number | null = null;
    const rebuildCardIdIndex = (map: ReadonlyMap<string, readonly CardDB[]>) => {
      const m = new Map<string, string>();
      for (const [listId, listCards] of map) {
        for (const c of listCards) {
          m.set(c.id, listId);
        }
      }
      cardIdToListIdRef.current = m;
    };
    const syncDragCardsFromStore = () => {
      const map = buildKanbanCardsMapFromRuntimeState(useBoardRuntimeStore.getState());
      kanbanDropCtxRef.current.cards = map;
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
  }, []);

  const suppressCardOpenClickRef = useRef(false);
  useKanbanPragmaticDnd({
    kanbanDropCtxRef,
    setDraggingCardId,
    setDraggingListId,
    setListDropIndicatorIfChanged,
  });

  useEffect(() => {
    const root = columnsGroupRef.current?.closest('.board-page');
    if (!(root instanceof HTMLElement)) {
      return undefined;
    }
    const dragging = draggingCardId != null || draggingListId != null;
    root.classList.toggle('board-page--kanban-dragging', dragging);
    return () => {
      root.classList.remove('board-page--kanban-dragging');
    };
  }, [draggingCardId, draggingListId]);

  return (
    <Group
      ref={columnsGroupRef}
      gap="md"
      className="board-page__columns"
      wrap="nowrap"
      align="flex-start"
    >
        {lists.map((list) => (
          <KanbanListColumn
            key={list.id}
            list={list}
            board={board}
            assigneeDirectory={assigneeDirectory}
            draggingCardId={draggingCardId}
            draggingListId={draggingListId}
            boardId={board.id}
            cardListMaxBodyPx={cardListMaxBodyPx}
            suppressCardOpenClickRef={suppressCardOpenClickRef}
            cardDropIndicator={
              cardDropIndicator != null && cardDropIndicator.listId === list.id
                ? cardDropIndicator
                : null
            }
            listReorderTarget={
              draggingListId != null &&
              listDropIndicator != null &&
              listDropIndicator.overListId === list.id
            }
            onCardCreated={handleCardCreated}
            onListUpdated={handleListUpdated}
            onOpenCard={onOpenCard}
            onCardUpdatedOnBoard={patchCardInBoardState}
            onCardDeletedFromBoard={removeCardFromBoardState}
            onKanbanCardsReload={handleKanbanCardsReload}
            kanbanCaps={kanbanCaps}
          />
        ))}

        {kanbanCaps.canAddList ? (
          <Box
            className={listColumnChrome.trackClassName}
            style={listColumnChrome.trackStyle}
          >
            {addListComposerOpen ? (
              <BoardInlineListComposer
                boardId={board.id}
                getNextPosition={getNextListPosition}
                onListCreated={handleListCreated}
                onCancel={closeAddListComposer}
              />
            ) : (
              <Button
                variant="default"
                className="board-page__add-list"
                justify="flex-start"
                leftSection={
                  <span className="board-page__add-list-icon" aria-hidden>
                    +
                  </span>
                }
                styles={KANBAN_ADD_LIST_BUTTON_STYLES}
                onClick={openAddListComposer}
              >
                Add another list
              </Button>
            )}
          </Box>
        ) : null}
    </Group>
  );
}
