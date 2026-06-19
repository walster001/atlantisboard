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
import { moveListToHoverSlot } from '../../store/kanbanDragPure.js';
import {
  fallbackDropForDraggedCard,
  kanbanInsertIndexForDrop,
  moveCardBetweenListsInMap,
  resolveCardDropTarget,
  resolveListDropListId,
} from './kanbanPragmaticDndHelpers.js';
import type { KanbanPragmaticCtx, UseKanbanPragmaticDndArgs } from './useKanbanPragmaticDnd/types.js';

type ElementDragSourcePayload = {
  readonly element: HTMLElement;
  readonly dragHandle: Element | null;
  readonly data: Record<string, unknown>;
};

function updateCardDropIndicatorForPointer(
  source: ElementDragSourcePayload,
  location: { readonly current: { readonly input: unknown; readonly dropTargets: readonly { readonly data: Record<string | symbol, unknown> }[] } },
  ctx: KanbanPragmaticCtx,
  cardDrag: { readonly cardId: string; readonly listId: string },
  scheduleAutoScroll: (input: Record<string, unknown> | null) => void,
): void {
  scheduleAutoScroll(location.current.input as Record<string, unknown> | null);
  const resolved = resolveCardDropTarget(
    location.current.input as Record<string, unknown> | null,
    location.current.dropTargets,
    ctx.cards,
    source.element,
    cardDrag.cardId,
  );
  // Do not use `fallbackDropForDraggedCard` for hover UI: when the pointer is not over a valid
  // drop surface it would paint a slot on the source list (looks like a "ghost" card gap).
  // `onDrop` still applies fallback for the actual commit when needed.
  if (resolved == null) {
    ctx.queueCardDropIndicator(null);
    return;
  }
  const metrics = { width: 248, height: 88 };
  ctx.queueCardDropIndicator({
    listId: resolved.listId,
    sourceListId: cardDrag.listId,
    anchorCardId: resolved.anchorCardId,
    columnIntent: resolved.columnIntent,
    boxWidth: metrics.width,
    boxHeight: metrics.height,
  });
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
      if (lastPointer == null) {
        return;
      }
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
        const scrollTarget =
          listBody.querySelector<HTMLElement>('.board-column__virtuoso-scroller') ?? listBody;
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
      const clientX = typeof input?.clientX === 'number' ? input.clientX : null;
      const clientY = typeof input?.clientY === 'number' ? input.clientY : null;
      if (clientX == null || clientY == null) {
        stopAutoScroll();
        return;
      }
      lastPointer = { x: clientX, y: clientY };
      if (autoScrollRafId == null) {
        autoScrollRafId = requestAnimationFrame(runAutoScroll);
      }
    };

    const cleanupMonitor = monitorForElements({
      onDragStart({ source }) {
        const data = source.data as Record<string, unknown>;
        const cardDrag = readKanbanCardDragData(data);
        if (cardDrag != null) {
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
          updateCardDropIndicatorForPointer(source, location, ctx, cardDrag, scheduleAutoScroll);
          const input = location.current.input as Record<string, unknown> | null;
          const clientX = typeof input?.clientX === 'number' ? input.clientX : null;
          if (clientX != null) {
            carouselEdgeBumpRef?.current?.(clientX);
          }
        }
      },
      onDropTargetChange({ source, location }) {
        const data = source.data as Record<string, unknown>;
        const ctx = kanbanDropCtxRef.current;
        const cardDrag = readKanbanCardDragData(data);
        if (cardDrag != null) {
          updateCardDropIndicatorForPointer(source, location, ctx, cardDrag, scheduleAutoScroll);
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
          stopAutoScroll();
          const indicatorSnapshot = resolveCardDropTarget(
            location.current.input as Record<string, unknown> | null,
            location.current.dropTargets,
            ctx.cards,
            source.element,
            cardDrag.cardId,
          );
          const resolvedOnDrop =
            indicatorSnapshot ?? fallbackDropForDraggedCard(ctx.cards, cardDrag.listId, cardDrag.cardId);
          const activeId = cardDrag.cardId;
          const activeListId = ctx.cardIdToListIdRef.current.get(activeId);
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
          } else {
            ctx.flushCardDropIndicatorNow(null);
            setDraggingCardId(null);
            setListDropIndicatorIfChanged(null);
          }
          void (async () => {
            if (activeListId == null || committedTargetListId == null || committedInsertIndex == null) {
              return;
            }

            try {
              if (!ctx.viewAliveRef.current) {
                return;
              }
              if (committedTargetListId === activeListId) {
                const movePayload = await api.moveCard(activeId, activeListId, committedInsertIndex);
                const moved = normalizeCardFromApi(movePayload.card, activeId);
                useBoardRuntimeStore.getState().upsertCard(moved);
                await persistDexieCardPut(moved);
              } else {
                const movePayload = await api.moveCard(activeId, committedTargetListId, committedInsertIndex);
                const moved = normalizeCardFromApi(movePayload.card, activeId);
                useBoardRuntimeStore.getState().upsertCard(moved);
                await persistDexieCardPut(moved);
              }
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
          if (overListId == null) {
            return;
          }
          void (async () => {
            const renumbered = moveListToHoverSlot(ctx.lists, listDrag.listId, overListId);
            if (renumbered == null) {
              return;
            }
            const to = renumbered.findIndex((l) => l.id === listDrag.listId);
            if (to < 0) {
              return;
            }
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
