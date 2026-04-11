import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  startTransition,
  type MutableRefObject,
} from 'react';
import { Box, Button, Group } from '@mantine/core';
import { db, type BoardDB, type ListDB, type CardDB } from '../../store/database.js';
import { api } from '../../utils/api.js';
import { transformList } from '../../utils/transform.js';
import {
  subscribeSocketCardDeleted,
  subscribeSocketCardUpdated,
  subscribeSocketListDeleted,
} from '../../utils/socketRealtimeBridge.js';
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
  board: BoardDB;
  lists: ListDB[];
  /** Increment when a card is removed outside drag/API paths (e.g. delete from detail) to reload from Dexie. */
  cardsRefreshKey?: number;
  /** Bumped after background card sync finishes so Dexie data is merged into UI. */
  cardHydrateEpoch?: number;
  /** Keeps BoardPage state in sync after column reorder (positions + order). */
  onListsReordered?: (lists: ListDB[]) => void;
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

/** Parallel Dexie reads — faster than awaiting each list in series. */
async function loadCardsMapFromDexie(listsToLoad: readonly ListDB[]): Promise<Map<string, CardDB[]>> {
  const entries = await Promise.all(
    listsToLoad.map(async (list) => {
      const listCards = await db.cards.where('listId').equals(list.id).sortBy('position');
      return [list.id, listCards] as const;
    }),
  );
  return new Map(entries);
}

function insertIndexAgainstAnchor(
  cardsWithoutActive: CardDB[],
  anchorCardId: string,
  edge: 'above' | 'below'
): number {
  const i = cardsWithoutActive.findIndex((c) => c.id === anchorCardId);
  if (i < 0) {
    return cardsWithoutActive.length;
  }
  return edge === 'above' ? i : i + 1;
}

/** Align `position` with array index (server order). */
function withRenumberedPositions(list: CardDB[]): CardDB[] {
  return list.map((c, i) => ({ ...c, position: i }));
}

/** Pure optimistic move: update only the two affected lists so memoized columns keep stable references. */
function moveCardBetweenListsInMap(
  prev: Map<string, CardDB[]>,
  cardId: string,
  fromListId: string,
  toListId: string,
  insertIndex: number,
): Map<string, CardDB[]> {
  if (fromListId === toListId) {
    return prev;
  }
  const fromList = prev.get(fromListId);
  if (!fromList) {
    return prev;
  }
  const card = fromList.find((c) => c.id === cardId);
  if (card == null) {
    return prev;
  }

  const next = new Map(prev);
  const newFrom = withRenumberedPositions(fromList.filter((c) => c.id !== cardId));

  const toList = prev.get(toListId) || [];
  const toWithout = toList.filter((c) => c.id !== cardId);
  const clamped = Math.max(0, Math.min(insertIndex, toWithout.length));
  const moved: CardDB = { ...card, listId: toListId };
  const newTo = withRenumberedPositions([
    ...toWithout.slice(0, clamped),
    moved,
    ...toWithout.slice(clamped),
  ]);

  next.set(fromListId, newFrom);
  next.set(toListId, newTo);
  return next;
}

/** Move active list to the index slot of the hovered column (Trello-style in a single drag). */
function moveListToHoverSlot(
  listsOrdered: ListDB[],
  activeListId: string,
  overListId: string,
): ListDB[] | null {
  if (activeListId === overListId) {
    return null;
  }
  const ordered = [...listsOrdered].sort((a, b) => a.position - b.position);
  const fromIdx = ordered.findIndex((l) => l.id === activeListId);
  const overIdx = ordered.findIndex((l) => l.id === overListId);
  if (fromIdx < 0 || overIdx < 0 || fromIdx === overIdx) {
    return null;
  }
  const next = [...ordered];
  const [removed] = next.splice(fromIdx, 1);
  if (removed == null) {
    return null;
  }
  /* Insert at hovered index in the post-removal array (same rule as arrayMove). */
  next.splice(overIdx, 0, removed);
  return next.map((l, i) => ({ ...l, position: i }));
}

function listOrderIdSignature(listsOrdered: readonly ListDB[]): string {
  return listsOrdered.map((l) => l.id).join(',');
}

export function KanbanView({
  board,
  lists: initialLists,
  cardsRefreshKey = 0,
  cardHydrateEpoch = 0,
  onListsReordered,
  onOpenCard,
  boardCardPatchRef,
  kanbanCaps,
}: KanbanViewProps) {
  const assigneeDirectory = useBoardAssigneeDirectory(board.id);
  const [lists, setLists] = useState<ListDB[]>(initialLists);
  const [cards, setCards] = useState<Map<string, CardDB[]>>(new Map());
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
  /** Tracks list IDs used by the cards Dexie sync effect (incremental vs full reload). */
  const cardSyncListIdsRef = useRef<ReadonlySet<string>>(new Set());
  const cardSyncRefreshKeyRef = useRef(cardsRefreshKey);
  const cardHydrateEpochRef = useRef(cardHydrateEpoch);
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

  // Sync lists when parent passes updated data (e.g. after socket or refetch).
  useEffect(() => {
    const sorted = [...initialLists].sort((a, b) => a.position - b.position);
    setLists(sorted);
  }, [initialLists]);

  const reloadAllCardsFromDb = useCallback(async () => {
    const currentLists = listsRef.current;
    const cardsMap = await loadCardsMapFromDexie(currentLists);
    if (viewAliveRef.current) {
      startTransition(() => {
        setCards(cardsMap);
      });
      cardSyncListIdsRef.current = new Set(currentLists.map((l) => l.id));
    }
  }, []);

  const patchCardInBoardState = useCallback(
    (updated: CardDB) => {
      startTransition(() => {
        setCards((prev) => {
          let found: { readonly oldListId: string; readonly index: number } | null = null;
          for (const [lid, listCards] of prev) {
            const i = listCards.findIndex((c) => c.id === updated.id);
            if (i >= 0) {
              found = { oldListId: lid, index: i };
              break;
            }
          }
          if (found == null) {
            void reloadAllCardsFromDb();
            return prev;
          }
          const { oldListId, index } = found;
          if (updated.listId === oldListId) {
            const listCards = prev.get(oldListId);
            if (listCards == null) {
              return prev;
            }
            if (listCards[index] === updated) {
              return prev;
            }
            const arr = [...listCards];
            arr[index] = updated;
            const next = new Map(prev);
            next.set(oldListId, arr);
            return next;
          }
          const fromArr = [...(prev.get(oldListId) ?? [])];
          if (index < 0 || index >= fromArr.length) {
            void reloadAllCardsFromDb();
            return prev;
          }
          fromArr.splice(index, 1);
          const toArr = [...(prev.get(updated.listId) ?? [])].filter((c) => c.id !== updated.id);
          toArr.push(updated);
          toArr.sort((a, b) => a.position - b.position);
          const next = new Map(prev);
          next.set(oldListId, fromArr);
          next.set(updated.listId, toArr);
          return next;
        });
      });
    },
    [reloadAllCardsFromDb],
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
    startTransition(() => {
      setCards((prev) => {
        let foundListId: string | null = null;
        for (const [lid, listCards] of prev) {
          if (listCards.some((c) => c.id === cardId)) {
            foundListId = lid;
            break;
          }
        }
        if (foundListId == null) {
          return prev;
        }
        const listCards = prev.get(foundListId);
        if (listCards == null) {
          return prev;
        }
        const filtered = listCards.filter((c) => c.id !== cardId);
        if (filtered.length === listCards.length) {
          return prev;
        }
        const next = new Map(prev);
        next.set(foundListId, filtered);
        return next;
      });
    });
  }, []);

  const handleListCreated = useCallback(
    (response?: { list: unknown }) => {
      if (!viewAliveRef.current) {
        return;
      }

      if (response?.list) {
        const newList = transformList(response.list);
        if (viewAliveRef.current) {
          setLists((prev) => [...prev, newList].sort((a, b) => a.position - b.position));
        }
        void db.lists.put(newList);
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

        let updatedLists = await db.lists.where('boardId').equals(board.id).sortBy('position');

        if (updatedLists.length === lengthBefore) {
          try {
            const apiResponse = await api.getListsByBoard(board.id);
            const rawLists = (apiResponse as { lists: unknown[] }).lists;
            const transformedLists = rawLists.map(transformList);
            await Promise.all(transformedLists.map((list) => db.lists.put(list)));
            updatedLists = transformedLists;
          } catch {
            /* API fetch failed */
          }
        }

        if (viewAliveRef.current) {
          setLists(updatedLists);
        }
        timeoutRef.current = null;
      }, 200);
    },
    [board.id],
  );

  useEffect(() => {
    const unsub = subscribeSocketCardUpdated(({ boardId, card }) => {
      if (boardId !== board.id || !viewAliveRef.current) {
        return;
      }
      patchCardInBoardState(card);
    });
    return unsub;
  }, [board.id, patchCardInBoardState]);

  const handleCardCreated = useCallback((listId: string, newCard: CardDB) => {
    if (!viewAliveRef.current) {
      return;
    }
    setCards((prev) => {
      const existing = [...(prev.get(listId) ?? [])];
      const without = existing.filter((c) => c.id !== newCard.id);
      without.push(newCard);
      without.sort((a, b) => a.position - b.position);
      return new Map(prev).set(listId, without);
    });
  }, []);

  const handleListUpdated = useCallback(async () => {
    if (!viewAliveRef.current || !board.id) return;
    const updatedLists = await db.lists.where('boardId').equals(board.id).sortBy('position');
    if (viewAliveRef.current) {
      setLists(updatedLists);
    }
  }, [board.id]);

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

  const kanbanDropCtxRef = useRef({
    board,
    lists,
    cards,
    cardIdToListIdRef,
    setLists,
    setCards,
    onListsReordered,
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
    setLists,
    setCards,
    onListsReordered,
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

  useEffect(() => {
    let cancelled = false;
    const listIds = new Set(lists.map((l) => l.id));
    const keyBumped = cardSyncRefreshKeyRef.current !== cardsRefreshKey;
    const hydrateBumped = cardHydrateEpochRef.current !== cardHydrateEpoch;
    cardSyncRefreshKeyRef.current = cardsRefreshKey;
    cardHydrateEpochRef.current = cardHydrateEpoch;

    const sync = async (): Promise<void> => {
      if (listIds.size === 0) {
        if (!cancelled && viewAliveRef.current) {
          startTransition(() => {
            setCards(new Map());
          });
        }
        cardSyncListIdsRef.current = new Set();
        return;
      }

      if (keyBumped || hydrateBumped) {
        const cardsMap = await loadCardsMapFromDexie(lists);
        if (!cancelled && viewAliveRef.current) {
          startTransition(() => {
            setCards(cardsMap);
          });
        }
        cardSyncListIdsRef.current = new Set(listIds);
        return;
      }

      const prevIds = cardSyncListIdsRef.current;
      const added = [...listIds].filter((id) => !prevIds.has(id));
      const removed = [...prevIds].filter((id) => !listIds.has(id));

      if (added.length === 0 && removed.length === 0) {
        return;
      }

      if (prevIds.size === 0) {
        const cardsMap = await loadCardsMapFromDexie(lists);
        if (!cancelled && viewAliveRef.current) {
          startTransition(() => {
            setCards(cardsMap);
          });
        }
        cardSyncListIdsRef.current = new Set(listIds);
        return;
      }

      const newEntries = await Promise.all(
        added.map(async (id) => {
          const listCards = await db.cards.where('listId').equals(id).sortBy('position');
          return [id, listCards] as const;
        }),
      );

      if (!cancelled && viewAliveRef.current) {
        startTransition(() => {
          setCards((prevMap) => {
            const next = new Map(prevMap);
            for (const id of removed) {
              next.delete(id);
            }
            for (const [id, listCards] of newEntries) {
              next.set(id, listCards);
            }
            return next;
          });
        });
      }
      cardSyncListIdsRef.current = new Set(listIds);
    };

    void sync();

    return () => {
      cancelled = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [lists, cardsRefreshKey, cardHydrateEpoch]);

  useEffect(() => {
    const unsub = subscribeSocketCardDeleted(({ boardId, cardId }) => {
      if (boardId !== board.id || !viewAliveRef.current) {
        return;
      }
      removeCardFromBoardState(cardId);
    });
    return unsub;
  }, [board.id, removeCardFromBoardState]);

  useEffect(() => {
    const unsub = subscribeSocketListDeleted(({ boardId, listId }) => {
      if (boardId !== board.id || !viewAliveRef.current) {
        return;
      }
      setLists((prev) => prev.filter((l) => l.id !== listId));
      setCards((prev) => {
        const next = new Map(prev);
        next.delete(listId);
        return next;
      });
    });
    return unsub;
  }, [board.id]);

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
