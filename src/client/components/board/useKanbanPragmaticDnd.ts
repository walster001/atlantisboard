import { useLayoutEffect, startTransition } from 'react';
import { flushSync } from 'react-dom';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { db } from '../../store/database.js';
import { api } from '../../utils/api.js';
import { normalizeCardFromApi, transformList } from '../../utils/transform.js';
import { persistDexieCardPut } from '../../store/boardDexieCache.js';
import { useBoardRuntimeStore } from '../../store/boardRuntimeStore.js';
import {
  readKanbanCardDragData,
  readKanbanListDragData,
} from '../../dnd/pragmatic/kanbanData.js';
import { moveCardBetweenListsInMap, moveListToHoverSlot } from '../../store/kanbanDragPure.js';
import {
  cardDropIndicatorFromResolved,
  DEFAULT_KANBAN_CARD_DROP_METRICS,
  initialCardDropForDraggedCard,
  isKanbanCardDropUnchanged,
  kanbanCardDragMetricsFromElement,
  kanbanInsertIndexForDrop,
  resolveCardDropOnRelease,
  resolveCardDropTarget,
  isPointerInKanbanDropZone,
  resolveListDropListId,
} from './kanbanPragmaticDndHelpers.js';
import {
  kanbanCardDragSlotRevealedRef,
  markKanbanCardDragStarted,
  resetKanbanMobileDragChromeState,
  sampleKanbanCardDragPointer,
} from './kanbanMobileDragState.js';
import { kanbanListBodyScroller } from './virtualizedCardListHelpers.js';
import type { KanbanPragmaticCtx, UseKanbanPragmaticDndArgs } from './useKanbanPragmaticDnd/types.js';

type PendingCardDragSeed = {
  readonly cardDrag: { readonly cardId: string; readonly listId: string };
  readonly metrics: { readonly width: number; readonly height: number };
};

function readPointerFromDragInput(
  input: Record<string, unknown> | null,
): { readonly x: number; readonly y: number } | null {
  const clientX = typeof input?.clientX === 'number' ? input.clientX : null;
  const clientY = typeof input?.clientY === 'number' ? input.clientY : null;
  if (clientX == null || clientY == null) return null;
  return { x: clientX, y: clientY };
}

function handleCardDragPointerMove(
  location: {
    readonly current: {
      readonly input: unknown;
      readonly dropTargets: readonly { readonly data: Record<string | symbol, unknown> }[];
    };
  },
  ctx: KanbanPragmaticCtx,
  cardDrag: { readonly cardId: string; readonly listId: string },
  dragMetrics: { readonly width: number; readonly height: number },
  scheduleAutoScroll: (input: Record<string, unknown> | null) => void,
  pendingSeed: PendingCardDragSeed | null,
): PendingCardDragSeed | null {
  const input = location.current.input as Record<string, unknown> | null;
  const pointer = readPointerFromDragInput(input);
  let nextPending = pendingSeed;
  if (pointer != null && sampleKanbanCardDragPointer(pointer.x, pointer.y) && pendingSeed != null) {
    const initial = initialCardDropForDraggedCard(
      ctx.cards,
      pendingSeed.cardDrag.listId,
      pendingSeed.cardDrag.cardId,
    );
    ctx.flushCardDropIndicatorNow(
      cardDropIndicatorFromResolved(initial, pendingSeed.cardDrag.listId, pendingSeed.metrics),
    );
    nextPending = null;
  }
  if (!kanbanCardDragSlotRevealedRef.current) {
    return nextPending;
  }
  scheduleAutoScroll(input);
  const resolved = resolveCardDropTarget(
    input,
    location.current.dropTargets,
    ctx.cards,
    cardDrag.cardId,
  );
  // No fallback hover UI when pointer is off a valid drop surface (avoids ghost gap on source list).
  ctx.queueCardDropIndicator(
    resolved == null ? null : cardDropIndicatorFromResolved(resolved, cardDrag.listId, dragMetrics),
  );
  return nextPending;
}

export function useKanbanPragmaticDnd(args: UseKanbanPragmaticDndArgs): void {
  const {
    kanbanDropCtxRef,
    setDraggingCardId,
    setDraggingListId,
    setListDropIndicatorIfChanged,
    carouselEdgeBumpRef,
  } = args;

  useLayoutEffect(() => {
    let activeCardDragMetrics: { readonly width: number; readonly height: number } =
      DEFAULT_KANBAN_CARD_DROP_METRICS;
    let pendingCardDragSeed: PendingCardDragSeed | null = null;
    let autoScrollRafId: number | null = null;
    let lastPointer: { x: number; y: number } | null = null;
    const stopAutoScroll = (): void => {
      lastPointer = null;
      if (autoScrollRafId != null) {
        cancelAnimationFrame(autoScrollRafId);
        autoScrollRafId = null;
      }
    };
    const runAutoScroll = (): void => {
      autoScrollRafId = null;
      if (lastPointer == null) return;
      const boardFrame = document.querySelector('.board-page__body');
      if (boardFrame instanceof HTMLElement) {
        const boardRect = boardFrame.getBoundingClientRect();
        const edgeSize = 56;
        const leftDelta = lastPointer.x - boardRect.left;
        const rightDelta = boardRect.right - lastPointer.x;
        if (leftDelta >= 0 && leftDelta < edgeSize) {
          boardFrame.scrollLeft -= Math.ceil((edgeSize - leftDelta) * 0.42);
        } else if (rightDelta >= 0 && rightDelta < edgeSize) {
          boardFrame.scrollLeft += Math.ceil((edgeSize - rightDelta) * 0.42);
        }
      }
      const hoverEl = document.elementFromPoint(lastPointer.x, lastPointer.y);
      const listBody = hoverEl?.closest?.('[data-kanban-list-body]');
      if (listBody instanceof HTMLElement) {
        const scrollTarget = kanbanListBodyScroller(listBody);
        const rect = scrollTarget.getBoundingClientRect();
        const edge = 42;
        const topDelta = lastPointer.y - rect.top;
        const bottomDelta = rect.bottom - lastPointer.y;
        if (topDelta >= 0 && topDelta < edge) {
          scrollTarget.scrollTop -= Math.ceil((edge - topDelta) * 0.46);
        } else if (bottomDelta >= 0 && bottomDelta < edge) {
          scrollTarget.scrollTop += Math.ceil((edge - bottomDelta) * 0.46);
        }
      }
      autoScrollRafId = requestAnimationFrame(runAutoScroll);
    };
    const scheduleAutoScroll = (input: Record<string, unknown> | null): void => {
      const pointer = readPointerFromDragInput(input);
      if (pointer == null) {
        stopAutoScroll();
        return;
      }
      lastPointer = pointer;
      if (autoScrollRafId == null) {
        autoScrollRafId = requestAnimationFrame(runAutoScroll);
      }
    };

    const cancelKanbanCardDrag = (ctx: KanbanPragmaticCtx): void => {
      stopAutoScroll();
      pendingCardDragSeed = null;
      activeCardDragMetrics = DEFAULT_KANBAN_CARD_DROP_METRICS;
      ctx.cancelPendingCardDropIndicatorRaf();
      flushSync(() => {
        ctx.flushCardDropIndicatorNow(null);
        setDraggingCardId(null);
        setListDropIndicatorIfChanged(null);
      });
      resetKanbanMobileDragChromeState();
    };

    const cleanupMonitor = monitorForElements({
      onDragStart({ source }) {
        const data = source.data as Record<string, unknown>;
        const cardDrag = readKanbanCardDragData(data);
        if (cardDrag != null) {
          activeCardDragMetrics = kanbanCardDragMetricsFromElement(source.element);
          markKanbanCardDragStarted();
          pendingCardDragSeed = { cardDrag, metrics: activeCardDragMetrics };
          setDraggingCardId(cardDrag.cardId);
          return;
        }
        const listDrag = readKanbanListDragData(data);
        if (listDrag != null) {
          setDraggingListId(listDrag.listId);
        }
      },
      /** Throttled pointer updates — `onDropTargetChange` alone misses moves within the same drop-target stack. */
      onDrag({ source, location }) {
        const ctx = kanbanDropCtxRef.current;
        const cardDrag = readKanbanCardDragData(source.data as Record<string, unknown>);
        if (cardDrag != null) {
          pendingCardDragSeed = handleCardDragPointerMove(
            location,
            ctx,
            cardDrag,
            activeCardDragMetrics,
            scheduleAutoScroll,
            pendingCardDragSeed,
          );
          const pointer = readPointerFromDragInput(
            location.current.input as Record<string, unknown> | null,
          );
          if (pointer != null && kanbanCardDragSlotRevealedRef.current) {
            carouselEdgeBumpRef?.current?.(pointer.x);
          }
        }
      },
      onDropTargetChange({ source, location }) {
        const data = source.data as Record<string, unknown>;
        const ctx = kanbanDropCtxRef.current;
        const cardDrag = readKanbanCardDragData(data);
        if (cardDrag != null) {
          pendingCardDragSeed = handleCardDragPointerMove(
            location,
            ctx,
            cardDrag,
            activeCardDragMetrics,
            scheduleAutoScroll,
            pendingCardDragSeed,
          );
          return;
        }

        const listDrag = readKanbanListDragData(data);
        if (listDrag != null) {
          stopAutoScroll();
          ctx.queueCardDropIndicator(null);
          const over = resolveListDropListId(listDrag.listId, location.current.dropTargets);
          setListDropIndicatorIfChanged(over == null ? null : { overListId: over });
        }
      },
      onDrop({ source, location }) {
        const data = source.data as Record<string, unknown>;
        const ctx = kanbanDropCtxRef.current;
        const cardDrag = readKanbanCardDragData(data);
        if (cardDrag != null) {
          if (!kanbanCardDragSlotRevealedRef.current) {
            cancelKanbanCardDrag(ctx);
            return;
          }
          const activeId = cardDrag.cardId;
          const activeListId = ctx.cardIdToListIdRef.current.get(activeId);
          const lastIndicator = ctx.cardDropIndicatorRef.current;
          if (
            activeListId != null &&
            lastIndicator != null &&
            isKanbanCardDropUnchanged(ctx.cards, activeId, activeListId, {
              listId: lastIndicator.listId,
              anchorCardId: lastIndicator.anchorCardId,
              columnIntent: lastIndicator.columnIntent,
            })
          ) {
            cancelKanbanCardDrag(ctx);
            return;
          }
          stopAutoScroll();
          pendingCardDragSeed = null;
          activeCardDragMetrics = DEFAULT_KANBAN_CARD_DROP_METRICS;
          const dropInput = location.current.input as Record<string, unknown> | null;
          const dropPointer = readPointerFromDragInput(dropInput);
          const pointerInDropZone = isPointerInKanbanDropZone(
            dropPointer?.x ?? null,
            dropPointer?.y ?? null,
          );
          const onDropTarget = pointerInDropZone
            ? resolveCardDropTarget(dropInput, location.current.dropTargets, ctx.cards, cardDrag.cardId)
            : null;
          const resolvedOnDrop = resolveCardDropOnRelease({
            lastIndicator,
            onDropTarget,
            sourceListId: cardDrag.listId,
            draggingCardId: cardDrag.cardId,
            cards: ctx.cards,
            pointerInDropZone,
          });
          let committedInsertIndex: number | null = null;
          let committedTargetListId: string | null = null;
          if (activeListId != null) {
            committedTargetListId = resolvedOnDrop.listId;
            const targetListCards = [...(ctx.cards.get(committedTargetListId) ?? [])];
            committedInsertIndex = kanbanInsertIndexForDrop(
              targetListCards,
              activeId,
              resolvedOnDrop,
            );
            if (isKanbanCardDropUnchanged(ctx.cards, activeId, activeListId, resolvedOnDrop)) {
              cancelKanbanCardDrag(ctx);
              return;
            }
            flushSync(() => {
              ctx.setCards((prev) =>
                moveCardBetweenListsInMap(
                  prev,
                  activeId,
                  activeListId,
                  committedTargetListId!,
                  committedInsertIndex!,
                ),
              );
              ctx.flushCardDropIndicatorNow(null);
              setDraggingCardId(null);
              setListDropIndicatorIfChanged(null);
            });
            resetKanbanMobileDragChromeState();
          } else {
            cancelKanbanCardDrag(ctx);
          }
          void (async () => {
            if (activeListId == null || committedTargetListId == null || committedInsertIndex == null) {
              return;
            }

            try {
              if (!ctx.viewAliveRef.current) return;
              const movePayload = await api.moveCard(
                activeId,
                committedTargetListId,
                committedInsertIndex,
              );
              const moved = normalizeCardFromApi(movePayload.card, activeId);
              useBoardRuntimeStore.getState().upsertCard(moved);
              await persistDexieCardPut(moved);
            } catch {
              await ctx.reloadAllCardsFromDb();
            }
          })();
          return;
        }

        const listDrag = readKanbanListDragData(data);
        if (listDrag != null) {
          stopAutoScroll();
          setDraggingListId(null);
          const overListId = resolveListDropListId(listDrag.listId, location.current.dropTargets);
          setListDropIndicatorIfChanged(null);
          if (overListId == null) return;
          void (async () => {
            const renumbered = moveListToHoverSlot(ctx.lists, listDrag.listId, overListId);
            if (renumbered == null) return;
            const to = renumbered.findIndex((l) => l.id === listDrag.listId);
            if (to < 0) return;
            startTransition(() => {
              ctx.setLists(renumbered);
            });
            try {
              const movePayload = await api.moveList(listDrag.listId, to);
              const moved = transformList((movePayload as { list: unknown }).list);
              await db.lists.put(moved);
            } catch {
              await ctx.reloadAllCardsFromDb();
            }
          })();
        }
      },
    });
    return () => {
      stopAutoScroll();
      cleanupMonitor();
    };
  }, [carouselEdgeBumpRef, kanbanDropCtxRef, setDraggingCardId, setDraggingListId, setListDropIndicatorIfChanged]);
}
