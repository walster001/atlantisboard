import { useLayoutEffect, startTransition } from 'react';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { db } from '../../store/database.js';
import { api } from '../../utils/api.js';
import { normalizeCardFromApi, transformList } from '../../utils/transform.js';
import { persistDexieCardPut } from '../../store/boardDexieCache.js';
import {
  readKanbanCardDragData,
  readKanbanListDragData,
} from '../../dnd/pragmatic/kanbanData.js';
import { compareBoardListOrder, spreadListPosForIndex } from '../../../shared/utils/listPos.js';
import {
  fallbackDropForDraggedCard,
  moveCardBetweenListsInMap,
  resolveCardDropTarget,
  resolveListDropListId,
} from './kanbanPragmaticDndHelpers.js';
import type { UseKanbanPragmaticDndArgs } from './useKanbanPragmaticDnd/types.js';

export function useKanbanPragmaticDnd(args: UseKanbanPragmaticDndArgs): void {
  const {
    kanbanDropCtxRef,
    setDraggingCardId,
    setDraggingListId,
    setListDropIndicatorIfChanged,
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
      onDropTargetChange({ source, location }) {
        const data = source.data as Record<string, unknown>;
        const ctx = kanbanDropCtxRef.current;
        const cardDrag = readKanbanCardDragData(data);
        if (cardDrag != null) {
          scheduleAutoScroll(location.current.input as Record<string, unknown> | null);
          const resolved = resolveCardDropTarget(
            location.current.input as Record<string, unknown> | null,
            location.current.dropTargets,
            ctx.cards,
            source.element,
            cardDrag.cardId,
          );
          const nextTarget =
            resolved ?? fallbackDropForDraggedCard(ctx.cards, cardDrag.listId, cardDrag.cardId);
          const metrics = { width: 248, height: 88 };
          ctx.queueCardDropIndicator({
            listId: nextTarget.listId,
            sourceListId: cardDrag.listId,
            anchorCardId: nextTarget.anchorCardId,
            columnIntent: nextTarget.columnIntent,
            boxWidth: metrics.width,
            boxHeight: metrics.height,
          });
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
          setDraggingCardId(null);
          setListDropIndicatorIfChanged(null);
          const indicatorSnapshot = resolveCardDropTarget(
            location.current.input as Record<string, unknown> | null,
            location.current.dropTargets,
            ctx.cards,
            source.element,
            cardDrag.cardId,
          );
          ctx.flushCardDropIndicatorNow(null);
          const resolvedOnDrop =
            indicatorSnapshot ?? fallbackDropForDraggedCard(ctx.cards, cardDrag.listId, cardDrag.cardId);
          void (async () => {
            const activeId = cardDrag.cardId;
            const activeListId = ctx.cardIdToListIdRef.current.get(activeId);
            if (activeListId == null) {
              return;
            }
            const targetListId = resolvedOnDrop.listId;
            const targetListCards = [...(ctx.cards.get(targetListId) ?? [])];
            const insertIndex = (() => {
              if (resolvedOnDrop.columnIntent === 'empty-column') {
                return 0;
              }
              if (resolvedOnDrop.columnIntent === 'append-end') {
                return targetListCards.filter((c) => c.id !== activeId).length;
              }
              const withoutActive = targetListCards.filter((c) => c.id !== activeId);
              const anchorId = resolvedOnDrop.anchorCardId;
              if (anchorId == null) {
                return withoutActive.length;
              }
              const anchorIdx = withoutActive.findIndex((c) => c.id === anchorId);
              if (anchorIdx < 0) {
                return withoutActive.length;
              }
              return resolvedOnDrop.columnIntent === 'above' ? anchorIdx : anchorIdx + 1;
            })();

            try {
              startTransition(() => {
                ctx.setCards((prev) =>
                  moveCardBetweenListsInMap(prev, activeId, activeListId, targetListId, insertIndex),
                );
              });
              if (!ctx.viewAliveRef.current) {
                return;
              }
              if (targetListId === activeListId) {
                const movePayload = await api.moveCard(activeId, activeListId, insertIndex);
                const moved = normalizeCardFromApi((movePayload as { card: unknown }).card, activeId);
                await persistDexieCardPut(moved);
              } else {
                const movePayload = await api.moveCard(activeId, targetListId, insertIndex);
                const moved = normalizeCardFromApi((movePayload as { card: unknown }).card, activeId);
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
            const lists = [...ctx.lists].sort((a, b) => compareBoardListOrder(a, b));
            const from = lists.findIndex((l) => l.id === listDrag.listId);
            const to = lists.findIndex((l) => l.id === overListId);
            if (from < 0 || to < 0 || from === to) {
              return;
            }
            const next = [...lists];
            const [moved] = next.splice(from, 1);
            if (moved == null) {
              return;
            }
            next.splice(to, 0, moved);
            const renumbered = next.map((row, i) => ({
              ...row,
              position: i,
              pos: spreadListPosForIndex(i),
            }));
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
  }, [kanbanDropCtxRef, setDraggingCardId, setDraggingListId, setListDropIndicatorIfChanged]);
}
