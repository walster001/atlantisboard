import { useEffect, useRef, startTransition, type MutableRefObject, type RefObject } from 'react';
import { db, type CardDB, type ListDB } from '../../store/database.js';
import {
  applyKanbanEdgeScroll,
  pickKanbanListBodyIdUnderPointer,
  pickKanbanListColumnIdAtClientX,
} from './kanbanPointerDrag.js';
import type { CardDropIndicatorTarget } from './VirtualizedCardList.js';
import { api } from '../../utils/api.js';
import { normalizeCardFromApi } from '../../utils/transform.js';
import { persistDexieCardPut } from '../../store/boardDexieCache.js';

const KANBAN_CARD_DRAG_START_DEADZONE_PX = 6;

interface ListDropIndicatorTarget {
  readonly overListId: string;
}

type PendingCard = {
  readonly kind: 'pending_card';
  readonly listId: string;
  readonly cardId: string;
  readonly startX: number;
  readonly startY: number;
  readonly pointerId: number;
};

type ActiveCard = {
  readonly kind: 'active_card';
  readonly listId: string;
  readonly cardId: string;
  readonly pointerId: number;
  readonly captureTarget: HTMLElement;
  /** Drag start (initial input) — indicator updates only after deadzone from this point. */
  readonly initialX: number;
  readonly initialY: number;
};

type PendingList = {
  readonly kind: 'pending_list';
  readonly listId: string;
  readonly startX: number;
  readonly startY: number;
  readonly pointerId: number;
};

type ActiveList = {
  readonly kind: 'active_list';
  readonly listId: string;
  readonly pointerId: number;
  readonly captureTarget: HTMLElement;
  readonly initialX: number;
  readonly initialY: number;
};

type DragSession = PendingCard | ActiveCard | PendingList | ActiveList | null;

function dragDistanceExceedsDeadzone(
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
  minPx: number = KANBAN_CARD_DRAG_START_DEADZONE_PX,
): boolean {
  return Math.hypot(clientX - startX, clientY - startY) >= minPx;
}

export interface KanbanDelegatedDragRefs {
  readonly columnsGroupRef: RefObject<HTMLDivElement | null>;
  readonly dragPreviewElRef: RefObject<HTMLDivElement | null>;
  readonly kanbanDropCtxRef: MutableRefObject<{
    board: { id: string };
    lists: ListDB[];
    cards: Map<string, CardDB[]>;
    cardIdToListIdRef: MutableRefObject<Map<string, string>>;
    setLists: React.Dispatch<React.SetStateAction<ListDB[]>>;
    setCards: React.Dispatch<React.SetStateAction<Map<string, CardDB[]>>>;
    reloadAllCardsFromDb: () => Promise<void>;
    queueCardDropIndicator: (next: CardDropIndicatorTarget | null) => void;
    flushCardDropIndicatorNow: (next: CardDropIndicatorTarget | null) => void;
    viewAliveRef: MutableRefObject<boolean>;
    /** When false, card / list drag sessions are not started (viewers without move/reorder keys). */
    dragCaps: {
      readonly canDragKanbanCards: boolean;
      readonly canReorderLists: boolean;
    };
  }>;
  readonly cardVerticalDropHintRef: MutableRefObject<{
    readonly listId: string;
    readonly anchorCardId: string;
    readonly intent: 'above' | 'below';
  } | null>;
  readonly dragMetricsRef: MutableRefObject<{ width: number; height: number }>;
  readonly listDropIndicatorRef: MutableRefObject<ListDropIndicatorTarget | null>;
  readonly pendingCardDragGeometryRef: MutableRefObject<{
    listId: string;
    sourceCardId: string;
    sourceListId: string;
    clientY: number;
  } | null>;
  readonly cardDragGeometryRafRef: MutableRefObject<number | null>;
  readonly cardDropIndicatorRef: MutableRefObject<CardDropIndicatorTarget | null>;
  readonly suppressCardOpenClickRef: MutableRefObject<boolean>;
  readonly previewPositionRef: MutableRefObject<{ x: number; y: number }>;
}

export type KanbanCardVerticalHint = {
  readonly listId: string;
  readonly anchorCardId: string;
  readonly intent: 'above' | 'below';
};

export interface KanbanDelegatedDragPureFns {
  readonly resolveCardDropInListFromPointer: (
    cardsInList: readonly CardDB[],
    sourceCardId: string,
    listId: string,
    clientY: number,
    root: HTMLElement | null,
    prev: KanbanCardVerticalHint | null,
  ) => { anchorCardId: string | null; columnIntent: 'empty-column' | 'above' | 'below' };
  readonly insertIndexAgainstAnchor: (
    cardsWithoutActive: CardDB[],
    anchorCardId: string,
    edge: 'above' | 'below',
  ) => number;
  readonly withRenumberedPositions: (list: CardDB[]) => CardDB[];
  readonly moveCardBetweenListsInMap: (
    prev: Map<string, CardDB[]>,
    cardId: string,
    fromListId: string,
    toListId: string,
    insertIndex: number,
  ) => Map<string, CardDB[]>;
  readonly moveListToHoverSlot: (
    listsOrdered: ListDB[],
    activeListId: string,
    overListId: string,
  ) => ListDB[] | null;
  readonly listOrderIdSignature: (listsOrdered: readonly ListDB[]) => string;
}

export interface KanbanDelegatedDragSetters {
  readonly setDraggingCardId: (id: string | null) => void;
  readonly setDraggingListId: (id: string | null) => void;
  readonly setListDropIndicatorIfChanged: (next: ListDropIndicatorTarget | null) => void;
  readonly cancelCardDragGeometryRaf: () => void;
  readonly cancelPendingCardDropIndicatorRaf: () => void;
}

/**
 * Delegated pointer drag: one `pointerdown` listener on the columns group (capture)
 * plus temporary `window` listeners only while a session is active.
 */
export function useKanbanDelegatedPointerDrag(
  refs: KanbanDelegatedDragRefs,
  pure: KanbanDelegatedDragPureFns,
  setters: KanbanDelegatedDragSetters,
  setFloatPreviewCard: (card: CardDB | null) => void,
  effectDeps: readonly unknown[],
): void {
  const sessionRef = useRef<DragSession>(null);
  const edgeScrollRafRef = useRef<number | null>(null);
  const pureRef = useRef(pure);
  pureRef.current = pure;
  const settersRef = useRef(setters);
  settersRef.current = setters;
  const floatSetterRef = useRef(setFloatPreviewCard);
  floatSetterRef.current = setFloatPreviewCard;
  const refsRef = useRef(refs);
  refsRef.current = refs;

  useEffect(() => {
    const root = refsRef.current.columnsGroupRef.current;
    if (root == null) {
      return undefined;
    }

    /** Cleared on disarm/unmount so pending timers do not retain the effect closure. */
    let suppressClickClearTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

    const stopEdgeScroll = (): void => {
      if (edgeScrollRafRef.current != null) {
        cancelAnimationFrame(edgeScrollRafRef.current);
        edgeScrollRafRef.current = null;
      }
    };

    const tickEdgeScroll = (): void => {
      edgeScrollRafRef.current = null;
      const s = sessionRef.current;
      if (s == null || (s.kind !== 'active_card' && s.kind !== 'active_list')) {
        return;
      }
      const boardBody = root.closest('.board-page__body');
      const { x, y } = refsRef.current.previewPositionRef.current;
      applyKanbanEdgeScroll({
        clientX: x,
        clientY: y,
        boardBody: boardBody instanceof HTMLElement ? boardBody : null,
      });
      edgeScrollRafRef.current = requestAnimationFrame(tickEdgeScroll);
    };

    const startEdgeScroll = (): void => {
      if (edgeScrollRafRef.current == null) {
        edgeScrollRafRef.current = requestAnimationFrame(tickEdgeScroll);
      }
    };

    const disarmWindow = (): void => {
      if (suppressClickClearTimeoutId !== null) {
        globalThis.clearTimeout(suppressClickClearTimeoutId);
        suppressClickClearTimeoutId = null;
      }
      window.removeEventListener('pointermove', onWindowMove, true);
      window.removeEventListener('pointerup', onWindowUp, true);
      window.removeEventListener('pointercancel', onWindowUp, true);
      window.removeEventListener('keydown', onKeyDown, true);
      stopEdgeScroll();
    };

    const syncPreviewPosition = (clientX: number, clientY: number): void => {
      refsRef.current.previewPositionRef.current = { x: clientX, y: clientY };
      const el = refsRef.current.dragPreviewElRef.current;
      if (el != null) {
        el.style.left = `${clientX}px`;
        el.style.top = `${clientY}px`;
      }
    };

    const runCardDropAsync = (
      clientX: number,
      clientY: number,
      cardSrc: { cardId: string; listId: string },
      verticalHintSnapshot: KanbanCardVerticalHint | null,
      indicatorSnapshotBeforeDrop: CardDropIndicatorTarget | null,
    ): void => {
      const r = refsRef.current;
      const p = pureRef.current;
      const ctx = r.kanbanDropCtxRef.current;
      void (async () => {
        if (!ctx.viewAliveRef.current) {
          return;
        }
        const targetListId = pickKanbanListBodyIdUnderPointer(clientX, clientY);
        if (targetListId == null) {
          await ctx.reloadAllCardsFromDb();
          return;
        }
        const activeIdStr = cardSrc.cardId;
        const activeListId = ctx.cardIdToListIdRef.current.get(activeIdStr);
        const activeCard =
          activeListId != null ? ctx.cards.get(activeListId)?.find((c) => c.id === activeIdStr) : undefined;
        if (!activeCard || activeListId == null) {
          return;
        }

        try {
          const targetListCards = [...(ctx.cards.get(targetListId) ?? [])];
          const indicatorSnapshot = indicatorSnapshotBeforeDrop;
          const resolved =
            indicatorSnapshot != null &&
            indicatorSnapshot.listId === targetListId &&
            indicatorSnapshot.sourceListId === cardSrc.listId &&
            (indicatorSnapshot.columnIntent === 'empty-column' ||
              ((indicatorSnapshot.columnIntent === 'above' || indicatorSnapshot.columnIntent === 'below') &&
                indicatorSnapshot.anchorCardId != null))
              ? {
                  anchorCardId: indicatorSnapshot.anchorCardId,
                  columnIntent: indicatorSnapshot.columnIntent,
                }
              : p.resolveCardDropInListFromPointer(
                  targetListCards,
                  activeIdStr,
                  targetListId,
                  clientY,
                  r.columnsGroupRef.current,
                  verticalHintSnapshot,
                );
          const insertIndex =
            resolved.columnIntent === 'empty-column' || resolved.anchorCardId == null
              ? 0
              : p.insertIndexAgainstAnchor(
                  targetListCards.filter((c) => c.id !== activeIdStr),
                  resolved.anchorCardId,
                  resolved.columnIntent,
                );

          if (targetListId === activeListId) {
            const listCards = ctx.cards.get(activeListId) || [];
            const withoutActive = listCards.filter((c) => c.id !== activeIdStr);
            const activeCardRow = listCards.find((c) => c.id === activeIdStr);
            if (activeCardRow == null) {
              return;
            }
            const clampedInsert = Math.max(0, Math.min(insertIndex, withoutActive.length));
            const newListCards = [
              ...withoutActive.slice(0, clampedInsert),
              activeCardRow,
              ...withoutActive.slice(clampedInsert),
            ];
            const unchanged =
              newListCards.length === listCards.length &&
              newListCards.every((c, idx) => c.id === listCards[idx]?.id);
            if (unchanged) {
              return;
            }
            const reorderedIds = newListCards.map((c) => c.id);
            const renumbered = p.withRenumberedPositions(newListCards);
            startTransition(() => {
              ctx.setCards((prev) => {
                const next = new Map(prev);
                next.set(activeListId, renumbered);
                return next;
              });
            });
            if (!ctx.viewAliveRef.current) {
              return;
            }
            await api.reorderCards(activeListId, reorderedIds);
          } else {
            startTransition(() => {
              ctx.setCards((prev) =>
                p.moveCardBetweenListsInMap(prev, activeIdStr, activeListId, targetListId, insertIndex),
              );
            });
            const movePayload = await api.moveCard(activeIdStr, targetListId, insertIndex);
            if (!ctx.viewAliveRef.current) {
              return;
            }
            const moved = normalizeCardFromApi(
              (movePayload as { card: unknown }).card,
              activeIdStr,
            );
            await persistDexieCardPut(moved);
          }
        } catch {
          await ctx.reloadAllCardsFromDb();
        }
      })();
    };

    const onWindowMove = (e: PointerEvent): void => {
      const s = sessionRef.current;
      const st = settersRef.current;
      const r = refsRef.current;
      const p = pureRef.current;
      if (s == null) {
        return;
      }
      if (e.pointerId !== s.pointerId) {
        return;
      }

      if (s.kind === 'pending_card') {
        if (!dragDistanceExceedsDeadzone(s.startX, s.startY, e.clientX, e.clientY)) {
          return;
        }
        const ctx = r.kanbanDropCtxRef.current;
        const card = ctx.cards.get(s.listId)?.find((c) => c.id === s.cardId);
        if (card == null) {
          sessionRef.current = null;
          disarmWindow();
          return;
        }
        const cardEl = root.querySelector<HTMLElement>(
          `[data-kanban-card-id="${CSS.escape(s.cardId)}"][data-kanban-list-id="${CSS.escape(s.listId)}"]`,
        );
        if (cardEl != null) {
          const rect = cardEl.getBoundingClientRect();
          if (rect.width > 0) {
            r.dragMetricsRef.current = { width: rect.width, height: rect.height };
          }
          try {
            cardEl.setPointerCapture(e.pointerId);
          } catch {
            /* noop */
          }
          sessionRef.current = {
            kind: 'active_card',
            listId: s.listId,
            cardId: s.cardId,
            pointerId: e.pointerId,
            captureTarget: cardEl,
            initialX: s.startX,
            initialY: s.startY,
          };
        } else {
          sessionRef.current = null;
          disarmWindow();
          return;
        }
        st.cancelCardDragGeometryRaf();
        r.cardVerticalDropHintRef.current = null;
        st.setListDropIndicatorIfChanged(null);
        st.setDraggingCardId(s.cardId);
        floatSetterRef.current(card);
        syncPreviewPosition(e.clientX, e.clientY);
        e.preventDefault();
        startEdgeScroll();
        return;
      }

      if (s.kind === 'pending_list') {
        if (!dragDistanceExceedsDeadzone(s.startX, s.startY, e.clientX, e.clientY)) {
          return;
        }
        const titleRow = root.querySelector<HTMLElement>(
          `.board-column[data-kanban-list-id="${CSS.escape(s.listId)}"] .board-column__title-row`,
        );
        if (titleRow != null) {
          try {
            titleRow.setPointerCapture(e.pointerId);
          } catch {
            /* noop */
          }
          globalThis.getSelection()?.removeAllRanges();
          sessionRef.current = {
            kind: 'active_list',
            listId: s.listId,
            pointerId: e.pointerId,
            captureTarget: titleRow,
            initialX: s.startX,
            initialY: s.startY,
          };
        } else {
          sessionRef.current = null;
          disarmWindow();
          return;
        }
        st.setDraggingListId(s.listId);
        e.preventDefault();
        startEdgeScroll();
        return;
      }

      if (s.kind === 'active_card') {
        syncPreviewPosition(e.clientX, e.clientY);
        const ctx = r.kanbanDropCtxRef.current;
        if (!dragDistanceExceedsDeadzone(s.initialX, s.initialY, e.clientX, e.clientY)) {
          r.cardVerticalDropHintRef.current = null;
          ctx.queueCardDropIndicator(null);
          e.preventDefault();
          return;
        }
        const listId = pickKanbanListBodyIdUnderPointer(e.clientX, e.clientY);
        if (listId == null) {
          r.cardVerticalDropHintRef.current = null;
          ctx.queueCardDropIndicator(null);
          e.preventDefault();
          return;
        }
        r.pendingCardDragGeometryRef.current = {
          listId,
          sourceCardId: s.cardId,
          sourceListId: s.listId,
          clientY: e.clientY,
        };
        if (r.cardDragGeometryRafRef.current != null) {
          e.preventDefault();
          return;
        }
        r.cardDragGeometryRafRef.current = requestAnimationFrame(() => {
          r.cardDragGeometryRafRef.current = null;
          const pg = r.pendingCardDragGeometryRef.current;
          const c = r.kanbanDropCtxRef.current;
          if (pg == null) {
            return;
          }
          const listCards = [...(c.cards.get(pg.listId) ?? [])];
          const resolved = p.resolveCardDropInListFromPointer(
            listCards,
            pg.sourceCardId,
            pg.listId,
            pg.clientY,
            r.columnsGroupRef.current,
            r.cardVerticalDropHintRef.current,
          );
          if (resolved.columnIntent !== 'empty-column' && resolved.anchorCardId != null) {
            r.cardVerticalDropHintRef.current = {
              listId: pg.listId,
              anchorCardId: resolved.anchorCardId,
              intent: resolved.columnIntent,
            };
          } else {
            r.cardVerticalDropHintRef.current = null;
          }
          const metrics = r.dragMetricsRef.current;
          c.queueCardDropIndicator({
            listId: pg.listId,
            sourceListId: pg.sourceListId,
            anchorCardId: resolved.anchorCardId,
            columnIntent: resolved.columnIntent,
            boxWidth: metrics.width,
            boxHeight: metrics.height,
          });
        });
        e.preventDefault();
        return;
      }

      if (s.kind === 'active_list') {
        syncPreviewPosition(e.clientX, e.clientY);
        const ctx = r.kanbanDropCtxRef.current;
        const stInner = settersRef.current;
        const pInner = pureRef.current;
        const rInner = refsRef.current;
        if (!dragDistanceExceedsDeadzone(s.initialX, s.initialY, e.clientX, e.clientY)) {
          stInner.setListDropIndicatorIfChanged(null);
          e.preventDefault();
          return;
        }
        ctx.queueCardDropIndicator(null);
        rInner.cardVerticalDropHintRef.current = null;
        const prevOver = rInner.listDropIndicatorRef.current?.overListId ?? null;
        const nextOver = pickKanbanListColumnIdAtClientX(
          rInner.columnsGroupRef.current,
          e.clientX,
          s.listId,
          prevOver,
        );
        if (nextOver == null) {
          stInner.setListDropIndicatorIfChanged(null);
          e.preventDefault();
          return;
        }
        ctx.setLists((prev) => {
          const moved = pInner.moveListToHoverSlot(prev, s.listId, nextOver);
          if (moved == null) {
            return prev;
          }
          if (pInner.listOrderIdSignature(moved) === pInner.listOrderIdSignature(prev)) {
            return prev;
          }
          return moved;
        });
        stInner.setListDropIndicatorIfChanged({ overListId: nextOver });
        e.preventDefault();
      }
    };

    const onWindowUp = (e: PointerEvent): void => {
      const s = sessionRef.current;
      const st = settersRef.current;
      const r = refsRef.current;
      if (s == null || e.pointerId !== s.pointerId) {
        return;
      }
      disarmWindow();
      sessionRef.current = null;

      try {
        if (s.kind === 'active_card' || s.kind === 'active_list') {
          s.captureTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* noop */
      }

      if (s.kind === 'pending_card' || s.kind === 'pending_list') {
        return;
      }

      if (s.kind === 'active_list') {
        st.setDraggingListId(null);
        st.setListDropIndicatorIfChanged(null);
        const ctx = r.kanbanDropCtxRef.current;
        /* Order already updated live during pointermove — persist that snapshot. */
        const finalLists = [...ctx.lists].sort((a, b) => a.position - b.position);
        const finalListIds = finalLists.map((l) => l.id);
        requestAnimationFrame(() => {
          void (async () => {
            if (!ctx.viewAliveRef.current) {
              return;
            }
            try {
              await api.reorderLists({
                boardId: ctx.board.id,
                listIds: finalListIds,
              });
              if (!ctx.viewAliveRef.current) {
                return;
              }
              await db.lists.bulkPut(finalLists);
            } catch {
              await ctx.reloadAllCardsFromDb();
            }
          })();
        });
        return;
      }

      if (s.kind === 'active_card') {
        r.suppressCardOpenClickRef.current = true;
        if (suppressClickClearTimeoutId !== null) {
          globalThis.clearTimeout(suppressClickClearTimeoutId);
        }
        suppressClickClearTimeoutId = globalThis.setTimeout(() => {
          suppressClickClearTimeoutId = null;
          r.suppressCardOpenClickRef.current = false;
        }, 400);
        st.setDraggingCardId(null);
        st.setListDropIndicatorIfChanged(null);
        const verticalHintSnapshot = r.cardVerticalDropHintRef.current;
        const indicatorSnapshotBeforeDrop = r.cardDropIndicatorRef.current;
        r.cardVerticalDropHintRef.current = null;
        floatSetterRef.current(null);
        r.kanbanDropCtxRef.current.flushCardDropIndicatorNow(null);
        requestAnimationFrame(() => {
          runCardDropAsync(
            e.clientX,
            e.clientY,
            { cardId: s.cardId, listId: s.listId },
            verticalHintSnapshot,
            indicatorSnapshotBeforeDrop,
          );
        });
      }
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') {
        return;
      }
      const s = sessionRef.current;
      const st = settersRef.current;
      const r = refsRef.current;
      if (s == null) {
        return;
      }
      disarmWindow();
      sessionRef.current = null;
      try {
        if (s.kind === 'active_card' || s.kind === 'active_list') {
          s.captureTarget.releasePointerCapture(s.pointerId);
        }
      } catch {
        /* noop */
      }
      st.cancelCardDragGeometryRaf();
      st.cancelPendingCardDropIndicatorRaf();
      r.cardVerticalDropHintRef.current = null;
      r.kanbanDropCtxRef.current.flushCardDropIndicatorNow(null);
      st.setDraggingCardId(null);
      st.setDraggingListId(null);
      st.setListDropIndicatorIfChanged(null);
      floatSetterRef.current(null);
      if (s.kind === 'active_list') {
        void r.kanbanDropCtxRef.current.reloadAllCardsFromDb();
      }
    };

    const onPointerDownCapture = (e: PointerEvent): void => {
      if (e.button !== 0) {
        return;
      }
      const t = e.target;
      if (!(t instanceof Element)) {
        return;
      }
      if (t.closest('button, a, input, textarea, select, [contenteditable="true"]')) {
        return;
      }
      if (t.closest('[data-kanban-delegated-drag-ignore="1"]')) {
        return;
      }
      if (t.closest('[role="dialog"]') || t.closest('[role="menu"]')) {
        return;
      }

      const cardBody = t.closest('.board-card__kanban-body');
      if (cardBody instanceof Element) {
        if (!refsRef.current.kanbanDropCtxRef.current.dragCaps.canDragKanbanCards) {
          return;
        }
        const cardEl = cardBody.closest('[data-kanban-card-id]');
        const listId = cardEl?.getAttribute('data-kanban-list-id') ?? null;
        const cardId = cardEl?.getAttribute('data-kanban-card-id') ?? null;
        if (listId != null && listId !== '' && cardId != null && cardId !== '') {
          sessionRef.current = {
            kind: 'pending_card',
            listId,
            cardId,
            startX: e.clientX,
            startY: e.clientY,
            pointerId: e.pointerId,
          };
          window.addEventListener('pointermove', onWindowMove, true);
          window.addEventListener('pointerup', onWindowUp, true);
          window.addEventListener('pointercancel', onWindowUp, true);
          window.addEventListener('keydown', onKeyDown, true);
          return;
        }
      }

      const titleRow = t.closest('.board-column__title-row');
      if (titleRow instanceof Element) {
        if (!refsRef.current.kanbanDropCtxRef.current.dragCaps.canReorderLists) {
          return;
        }
        const col = titleRow.closest('.board-column[data-kanban-list-id]');
        const listId = col?.getAttribute('data-kanban-list-id') ?? null;
        if (listId != null && listId !== '') {
          sessionRef.current = {
            kind: 'pending_list',
            listId,
            startX: e.clientX,
            startY: e.clientY,
            pointerId: e.pointerId,
          };
          window.addEventListener('pointermove', onWindowMove, true);
          window.addEventListener('pointerup', onWindowUp, true);
          window.addEventListener('pointercancel', onWindowUp, true);
          window.addEventListener('keydown', onKeyDown, true);
          /* Suppress native text selection on the list title while a list drag may start. */
          e.preventDefault();
        }
      }
    };

    root.addEventListener('pointerdown', onPointerDownCapture, true);

    return () => {
      root.removeEventListener('pointerdown', onPointerDownCapture, true);
      disarmWindow();
      sessionRef.current = null;
    };
  }, effectDeps);
}
