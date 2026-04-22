import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { Box, Button, Group } from '@mantine/core';
import { useShallow } from 'zustand/react/shallow';
import type { ListDB, CardDB } from '../../store/database.js';
import { api } from '../../utils/api.js';
import { transformList } from '../../utils/transform.js';
import {
  getBoardListColumnWidthChrome,
  getBoardListColumnWidthPx,
} from '../../utils/boardListColumnWidth.js';
import { SortableList } from './SortableList.js';
import { BoardInlineListComposer } from './BoardInlineListComposer.js';
import type { CardDropIndicatorTarget } from './VirtualizedCardList.js';
import { getKanbanCardListMaxBodyPx } from './kanbanCardListLayout.js';
import {
  useKanbanDelegatedPointerDrag,
  type KanbanDelegatedDragRefs,
} from './useKanbanDelegatedPointerDrag.js';
import {
  insertIndexAgainstAnchor,
  withRenumberedPositions,
  moveCardBetweenListsInMap,
  moveListToHoverSlot,
  listOrderIdSignature,
} from './kanbanDragPure.js';
import {
  useBoardRuntimeStore,
  buildKanbanCardsMapFromRuntimeState,
  boardRuntimeApplySetCardsFromUpdater,
} from '../../store/boardRuntimeStore.js';
import { resyncBoardRuntimeFromApi } from '../../store/boardBootstrap.js';
import { persistDexieListPut, persistDexieCardPut } from '../../store/boardDexieCache.js';
import { useBoardAssigneeDirectory } from '../../hooks/useBoardAssigneeDirectory.js';
import { TwemojiPlainText } from '../common/TwemojiPlainText.js';
import type { KanbanBoardEditCaps } from '../../hooks/useBoardPermissions.js';
import './boardView.css';

/** Same-list anchor switching: keep current anchor until pointer exits this expanded zone. */
const KANBAN_CARD_ANCHOR_SWITCH_BUFFER_PX = 20;
/** Midline band: keep above/below intent stable while pointer crosses card center (reduces flicker). */
const KANBAN_CARD_MIDLINE_HYSTERESIS_PX = 12;
interface KanbanCardVerticalHint {
  readonly listId: string;
  readonly anchorCardId: string;
  readonly intent: 'above' | 'below';
}

interface ListDropIndicatorTarget {
  readonly overListId: string;
}

function findKanbanCardElementByIdentity(
  root: HTMLElement | null,
  listId: string,
  cardId: string,
): HTMLElement | null {
  if (root == null) {
    return null;
  }
  const escapedListId = CSS.escape(listId);
  const escapedCardId = CSS.escape(cardId);
  return root.querySelector<HTMLElement>(
    `[data-kanban-list-id="${escapedListId}"][data-kanban-card-id="${escapedCardId}"]`,
  );
}

/**
 * Resolve insertion anchor from pointer position using rendered card bounds.
 * This mirrors the pragmatic board approach: one active drop location in a list at a time.
 */
function resolveCardDropInListFromPointer(
  cardsInList: readonly CardDB[],
  sourceCardId: string,
  listId: string,
  clientY: number,
  root: HTMLElement | null,
  prev: KanbanCardVerticalHint | null,
): { anchorCardId: string | null; columnIntent: 'empty-column' | 'above' | 'below' } {
  const withoutSource = cardsInList.filter((c) => c.id !== sourceCardId);
  if (withoutSource.length === 0) {
    return { anchorCardId: null, columnIntent: 'empty-column' };
  }

  if (prev != null && prev.listId === listId) {
    const prevAnchor = findKanbanCardElementByIdentity(root, prev.listId, prev.anchorCardId);
    if (prevAnchor != null) {
      const r = prevAnchor.getBoundingClientRect();
      if (
        clientY >= r.top - KANBAN_CARD_ANCHOR_SWITCH_BUFFER_PX &&
        clientY <= r.bottom + KANBAN_CARD_ANCHOR_SWITCH_BUFFER_PX
      ) {
        return { anchorCardId: prev.anchorCardId, columnIntent: prev.intent };
      }
    }
  }

  let lastId: string | null = null;
  for (const card of withoutSource) {
    const el = findKanbanCardElementByIdentity(root, listId, card.id);
    lastId = card.id;
    if (el == null) {
      continue;
    }
    const rect = el.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const h = KANBAN_CARD_MIDLINE_HYSTERESIS_PX;
    const inMidBand = clientY >= midY - h && clientY <= midY + h;
    if (
      prev != null &&
      prev.listId === listId &&
      prev.anchorCardId === card.id &&
      (prev.intent === 'above' || prev.intent === 'below') &&
      inMidBand
    ) {
      return { anchorCardId: card.id, columnIntent: prev.intent };
    }
    if (clientY < midY) {
      return { anchorCardId: card.id, columnIntent: 'above' };
    }
  }
  return { anchorCardId: lastId, columnIntent: 'below' };
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

export function KanbanView({ onOpenCard, boardCardPatchRef, kanbanCaps }: KanbanViewProps) {
  const board = useBoardRuntimeStore((s) => s.board);
  const lists = useBoardRuntimeStore(
    useShallow((s) =>
      s.orderedListIds
        .map((id) => s.listsById[id])
        .filter((l): l is ListDB => l != null),
    ),
  );
  const cardsVersion = useBoardRuntimeStore((s) => s.cardsVersion);
  const listOrderKey = useBoardRuntimeStore((s) => s.orderedListIds.join(','));
  const cards = useMemo(() => buildKanbanCardsMapFromRuntimeState(useBoardRuntimeStore.getState()), [
    cardsVersion,
    listOrderKey,
  ]);

  if (board == null) {
    return null;
  }

  const assigneeDirectory = useBoardAssigneeDirectory(board.id);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [draggingListId, setDraggingListId] = useState<string | null>(null);
  const [addListComposerOpen, setAddListComposerOpen] = useState(false);
  const [cardListMaxBodyPx, setCardListMaxBodyPx] = useState(getKanbanCardListMaxBodyPx);
  const [cardDropIndicator, setCardDropIndicator] = useState<CardDropIndicatorTarget | null>(null);
  const cardDropIndicatorRef = useRef<CardDropIndicatorTarget | null>(null);
  const [listDropIndicator, setListDropIndicator] = useState<ListDropIndicatorTarget | null>(null);
  const listDropIndicatorRef = useRef<ListDropIndicatorTarget | null>(null);
  const pendingCardDropIndicatorRef = useRef<CardDropIndicatorTarget | null>(null);
  /** One rAF per frame batches pointermove; avoids double-rAF latency on drop hints. */
  const cardDropIndicatorRafRef = useRef<number | null>(null);

  const cancelPendingCardDropIndicatorRaf = (): void => {
    const id = cardDropIndicatorRafRef.current;
    if (id != null) {
      cancelAnimationFrame(id);
      cardDropIndicatorRafRef.current = null;
    }
  };

  const cardDragGeometryRafRef = useRef<number | null>(null);
  const pendingCardDragGeometryRef = useRef<{
    listId: string;
    sourceCardId: string;
    sourceListId: string;
    clientY: number;
  } | null>(null);

  const cancelCardDragGeometryRaf = useCallback((): void => {
    if (cardDragGeometryRafRef.current != null) {
      cancelAnimationFrame(cardDragGeometryRafRef.current);
      cardDragGeometryRafRef.current = null;
    }
    pendingCardDragGeometryRef.current = null;
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
      if (next == null) {
        cancelCardDragGeometryRaf();
      }
      pendingCardDropIndicatorRef.current = next;
      if (cardDropIndicatorRafRef.current != null) {
        return;
      }
      cardDropIndicatorRafRef.current = requestAnimationFrame(() => {
        cardDropIndicatorRafRef.current = null;
        setCardDropIndicatorIfChanged(pendingCardDropIndicatorRef.current);
      });
    },
    [setCardDropIndicatorIfChanged, cancelCardDragGeometryRaf],
  );

  const flushCardDropIndicatorNow = useCallback(
    (next: CardDropIndicatorTarget | null) => {
      cancelPendingCardDropIndicatorRaf();
      cancelCardDragGeometryRaf();
      pendingCardDropIndicatorRef.current = next;
      setCardDropIndicatorIfChanged(next);
    },
    [setCardDropIndicatorIfChanged, cancelCardDragGeometryRaf],
  );

  /** True only while this view is mounted — never cleared by nested effects (lists/cards load). */
  const viewAliveRef = useRef(true);
  const listsRef = useRef(lists);
  listsRef.current = lists;
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  /** O(1) lookup for drop handling — rebuilt when `cards` changes. */
  const cardIdToListIdRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const m = new Map<string, string>();
    for (const [listId, listCards] of cards) {
      for (const c of listCards) {
        m.set(c.id, listId);
      }
    }
    cardIdToListIdRef.current = m;
  }, [cards]);
  const columnsGroupRef = useRef<HTMLDivElement | null>(null);

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
        setCardListMaxBodyPx(getKanbanCardListMaxBodyPx());
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
  const dragMetricsRef = useRef({ width: 248, height: 88 });
  const cardVerticalDropHintRef = useRef<KanbanCardVerticalHint | null>(null);

  useEffect(() => {
    viewAliveRef.current = true;
    return () => {
      cancelPendingCardDropIndicatorRaf();
      cancelCardDragGeometryRaf();
      viewAliveRef.current = false;
      if (timeoutRef.current != null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [cancelCardDragGeometryRaf]);

  const reloadAllCardsFromDb = useCallback(async () => {
    if (!viewAliveRef.current || board == null) {
      return;
    }
    await resyncBoardRuntimeFromApi(board.id);
  }, [board]);

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

        let updatedLists: ListDB[] = useBoardRuntimeStore
          .getState()
          .orderedListIds.map((id) => useBoardRuntimeStore.getState().listsById[id])
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
    if (!viewAliveRef.current || board == null) {
      return;
    }
    try {
      const apiResponse = await api.getListsByBoard(board.id);
      const rawLists = (apiResponse as { lists: unknown[] }).lists;
      const transformedLists = rawLists.map(transformList);
      if (viewAliveRef.current) {
        useBoardRuntimeStore.getState().setListsFromArray(transformedLists);
      }
      await Promise.all(transformedLists.map((l) => persistDexieListPut(l)));
    } catch {
      /* noop */
    }
  }, [board]);

  const getNextListPosition = useCallback((): number => listsRef.current.length, []);

  const listColumnChrome = useMemo(() => getBoardListColumnWidthChrome(board), [board]);

  const closeAddListComposer = useCallback((): void => {
    setAddListComposerOpen(false);
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

  const kanbanDropCtxRef = useRef({
    board,
    lists,
    cards,
    cardIdToListIdRef,
    setLists: setListsCompat,
    setCards: setCardsCompat,
    reloadAllCardsFromDb,
    queueCardDropIndicator,
    flushCardDropIndicatorNow,
    viewAliveRef,
    dragCaps: {
      canDragKanbanCards: kanbanCaps.canDragKanbanCards,
      canReorderLists: kanbanCaps.canReorderLists,
    },
  });
  kanbanDropCtxRef.current = {
    board,
    lists,
    cards,
    cardIdToListIdRef,
    setLists: setListsCompat,
    setCards: setCardsCompat,
    reloadAllCardsFromDb,
    queueCardDropIndicator,
    flushCardDropIndicatorNow,
    viewAliveRef,
    dragCaps: {
      canDragKanbanCards: kanbanCaps.canDragKanbanCards,
      canReorderLists: kanbanCaps.canReorderLists,
    },
  };

  const dragPreviewElRef = useRef<HTMLDivElement | null>(null);
  const previewPositionRef = useRef({ x: 0, y: 0 });
  const suppressCardOpenClickRef = useRef(false);
  const [floatPreviewCard, setFloatPreviewCard] = useState<CardDB | null>(null);

  /** Order-independent — list reorder during drag must not re-run the delegated drag effect (would disarm window listeners). */
  const kanbanDelegatedDragListIdentityKey = useMemo(() => {
    const ids = lists.map((l) => l.id);
    ids.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return ids.join(',');
  }, [lists]);

  useKanbanDelegatedPointerDrag(
    {
      columnsGroupRef,
      dragPreviewElRef,
      kanbanDropCtxRef,
      cardVerticalDropHintRef,
      dragMetricsRef,
      listDropIndicatorRef,
      pendingCardDragGeometryRef,
      cardDragGeometryRafRef,
      cardDropIndicatorRef,
      suppressCardOpenClickRef,
      previewPositionRef,
    } as KanbanDelegatedDragRefs,
    {
      resolveCardDropInListFromPointer,
      insertIndexAgainstAnchor,
      withRenumberedPositions,
      moveCardBetweenListsInMap,
      moveListToHoverSlot,
      listOrderIdSignature,
    },
    {
      setDraggingCardId,
      setDraggingListId,
      setListDropIndicatorIfChanged,
      cancelCardDragGeometryRaf,
      cancelPendingCardDropIndicatorRaf,
    },
    setFloatPreviewCard,
    [
      board.id,
      kanbanDelegatedDragListIdentityKey,
      kanbanCaps.canDragKanbanCards,
      kanbanCaps.canReorderLists,
    ],
  );

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
    <>
      <div
        ref={dragPreviewElRef}
        data-kanban-drag-preview="1"
        className="kanban-drag-float-host"
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          zIndex: 6000,
          pointerEvents: 'none',
          visibility: floatPreviewCard != null ? 'visible' : 'hidden',
          transform: 'translate(-12px, -8px)',
        }}
        aria-hidden
      >
        {floatPreviewCard != null ? (
          <div
            className="board-page__dnd-native-card-preview"
            style={{ width: getBoardListColumnWidthPx(board) }}
          >
            {floatPreviewCard.labels.length > 0 ? (
              <div className="board-page__dnd-native-card-preview-labels">
                {floatPreviewCard.labels.map((label) => (
                  <span
                    key={label.id}
                    className="board-page__dnd-native-card-preview-badge"
                    style={{ backgroundColor: label.color }}
                  >
                    {label.name.toUpperCase()}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="board-page__dnd-native-card-preview-title">
              <TwemojiPlainText text={floatPreviewCard.title} />
            </div>
          </div>
        ) : null}
      </div>
      <Group
        ref={columnsGroupRef}
        gap="md"
        className="board-page__columns"
        wrap="nowrap"
        align="flex-start"
      >
        {lists.map((list) => (
          <SortableList
            key={list.id}
            list={list}
            board={board}
            assigneeDirectory={assigneeDirectory}
            cards={cards.get(list.id) || []}
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
            onKanbanCardsReload={() => {
              void reloadAllCardsFromDb();
            }}
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
                styles={{
                  inner: {
                    padding: '11px 16px 11px 14px',
                  },
                  section: {
                    marginInlineEnd: 6,
                  },
                }}
                onClick={() => setAddListComposerOpen(true)}
              >
                Add another list
              </Button>
            )}
          </Box>
        ) : null}
      </Group>
    </>
  );
}
