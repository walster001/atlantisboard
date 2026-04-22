import { useEffect, startTransition, type MutableRefObject } from 'react';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { db, type CardDB, type ListDB } from '../../store/database.js';
import { api } from '../../utils/api.js';
import { normalizeCardFromApi } from '../../utils/transform.js';
import { persistDexieCardPut } from '../../store/boardDexieCache.js';
import {
  readKanbanCardDragData,
  readKanbanCardDropData,
  readKanbanListBodyDropData,
  readKanbanListColumnDropData,
  readKanbanListDragData,
} from '../../dnd/pragmatic/kanbanData.js';
import type { CardDropIndicatorTarget } from './VirtualizedCardList.js';

interface ListDropIndicatorTarget {
  readonly overListId: string;
}

interface KanbanPragmaticCtx {
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
}

interface UseKanbanPragmaticDndArgs {
  readonly kanbanDropCtxRef: MutableRefObject<KanbanPragmaticCtx>;
  readonly setDraggingCardId: (id: string | null) => void;
  readonly setDraggingListId: (id: string | null) => void;
  readonly setListDropIndicatorIfChanged: (next: ListDropIndicatorTarget | null) => void;
}

interface ResolvedCardDrop {
  readonly listId: string;
  readonly anchorCardId: string | null;
  readonly columnIntent: 'empty-column' | 'append-end' | 'above' | 'below';
}

function withRenumberedPositions(list: readonly CardDB[]): CardDB[] {
  return list.map((row, i) => ({ ...row, position: i }));
}

function moveCardBetweenListsInMap(
  prev: Map<string, CardDB[]>,
  cardId: string,
  fromListId: string,
  toListId: string,
  insertIndex: number,
): Map<string, CardDB[]> {
  const from = [...(prev.get(fromListId) ?? [])];
  const to = fromListId === toListId ? from : [...(prev.get(toListId) ?? [])];
  const active = from.find((c) => c.id === cardId);
  if (active == null) {
    return prev;
  }
  const next = new Map(prev);
  const fromWithout = from.filter((c) => c.id !== cardId);
  const moved: CardDB = fromListId === toListId ? active : { ...active, listId: toListId };
  const toWithout = to.filter((c) => c.id !== cardId);
  const clamped = Math.max(0, Math.min(insertIndex, toWithout.length));
  const nextTo = [...toWithout.slice(0, clamped), moved, ...toWithout.slice(clamped)];
  if (fromListId === toListId) {
    next.set(fromListId, withRenumberedPositions(nextTo));
    return next;
  }
  next.set(fromListId, withRenumberedPositions(fromWithout));
  next.set(toListId, withRenumberedPositions(nextTo));
  return next;
}

function resolveCardDropTarget(
  dropTargets: readonly { readonly data: Record<string | symbol, unknown> }[],
  cards: Map<string, CardDB[]>,
  draggedEl: Element | null,
): ResolvedCardDrop | null {
  for (const t of dropTargets) {
    const rec = t.data as Record<string, unknown>;
    const cardTarget = readKanbanCardDropData(rec);
    if (cardTarget != null) {
      let edge: 'top' | 'bottom' | null = null;
      if (draggedEl instanceof HTMLElement) {
        const draggedCard = draggedEl.closest<HTMLElement>('[data-kanban-list-id][data-kanban-card-id]');
        const targetCard = document.querySelector<HTMLElement>(
          `[data-kanban-list-id="${CSS.escape(cardTarget.listId)}"][data-kanban-card-id="${CSS.escape(cardTarget.cardId)}"]`,
        );
        if (draggedCard != null && targetCard != null) {
          const draggedRect = draggedCard.getBoundingClientRect();
          const targetRect = targetCard.getBoundingClientRect();
          const draggedMidY = draggedRect.top + draggedRect.height / 2;
          const targetMidY = targetRect.top + targetRect.height / 2;
          edge = draggedMidY < targetMidY ? 'top' : 'bottom';
        }
      }
      if (edge == null) {
        const fallbackEdge = extractClosestEdge(rec);
        edge = fallbackEdge === 'top' ? 'top' : 'bottom';
      }
      return {
        listId: cardTarget.listId,
        anchorCardId: cardTarget.cardId,
        columnIntent: edge === 'top' ? 'above' : 'below',
      };
    }
  }
  for (const t of dropTargets) {
    const rec = t.data as Record<string, unknown>;
    const bodyTarget = readKanbanListBodyDropData(rec);
    if (bodyTarget != null) {
      const listCards = cards.get(bodyTarget.listId) ?? [];
      if (listCards.length === 0) {
        return { listId: bodyTarget.listId, anchorCardId: null, columnIntent: 'empty-column' };
      }
      return {
        listId: bodyTarget.listId,
        anchorCardId: listCards[listCards.length - 1]?.id ?? null,
        columnIntent: 'append-end',
      };
    }
  }
  return null;
}

function resolveListDropListId(
  sourceListId: string,
  dropTargets: readonly { readonly data: Record<string | symbol, unknown> }[],
): string | null {
  for (const t of dropTargets) {
    const rec = t.data as Record<string, unknown>;
    const listColumnTarget = readKanbanListColumnDropData(rec);
    if (listColumnTarget != null && listColumnTarget.listId !== sourceListId) {
      return listColumnTarget.listId;
    }
  }
  return null;
}

export function useKanbanPragmaticDnd(args: UseKanbanPragmaticDndArgs): void {
  const {
    kanbanDropCtxRef,
    setDraggingCardId,
    setDraggingListId,
    setListDropIndicatorIfChanged,
  } = args;

  useEffect(() => {
    return monitorForElements({
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
          const resolved = resolveCardDropTarget(
            location.current.dropTargets,
            ctx.cards,
            source.element,
          );
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
          return;
        }

        const listDrag = readKanbanListDragData(data);
        if (listDrag != null) {
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
          setDraggingCardId(null);
          setListDropIndicatorIfChanged(null);
          const indicatorSnapshot = resolveCardDropTarget(
            location.current.dropTargets,
            ctx.cards,
            source.element,
          );
          ctx.flushCardDropIndicatorNow(null);
          if (indicatorSnapshot == null) {
            return;
          }
          void (async () => {
            const activeId = cardDrag.cardId;
            const activeListId = ctx.cardIdToListIdRef.current.get(activeId);
            if (activeListId == null) {
              return;
            }
            const targetListId = indicatorSnapshot.listId;
            const targetListCards = [...(ctx.cards.get(targetListId) ?? [])];
            const insertIndex = (() => {
              if (indicatorSnapshot.columnIntent === 'empty-column') {
                return 0;
              }
              if (indicatorSnapshot.columnIntent === 'append-end') {
                return targetListCards.filter((c) => c.id !== activeId).length;
              }
              const withoutActive = targetListCards.filter((c) => c.id !== activeId);
              const anchorId = indicatorSnapshot.anchorCardId;
              if (anchorId == null) {
                return withoutActive.length;
              }
              const anchorIdx = withoutActive.findIndex((c) => c.id === anchorId);
              if (anchorIdx < 0) {
                return withoutActive.length;
              }
              return indicatorSnapshot.columnIntent === 'above' ? anchorIdx : anchorIdx + 1;
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
                const listCards = ctx.cards.get(activeListId) ?? [];
                const withoutActive = listCards.filter((c) => c.id !== activeId);
                const clamped = Math.max(0, Math.min(insertIndex, withoutActive.length));
                const orderedCardIds = [
                  ...withoutActive.slice(0, clamped).map((c) => c.id),
                  activeId,
                  ...withoutActive.slice(clamped).map((c) => c.id),
                ];
                await api.reorderCards(activeListId, orderedCardIds);
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
          setDraggingListId(null);
          const overListId = resolveListDropListId(listDrag.listId, location.current.dropTargets);
          setListDropIndicatorIfChanged(null);
          if (overListId == null) {
            return;
          }
          void (async () => {
            const lists = [...ctx.lists].sort((a, b) => a.position - b.position);
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
            const renumbered = next.map((row, i) => ({ ...row, position: i }));
            startTransition(() => {
              ctx.setLists(renumbered);
            });
            try {
              await api.reorderLists({
                boardId: ctx.board.id,
                listIds: renumbered.map((l) => l.id),
              });
              await db.lists.bulkPut(renumbered);
            } catch {
              await ctx.reloadAllCardsFromDb();
            }
          })();
        }
      },
    });
  }, [kanbanDropCtxRef, setDraggingCardId, setDraggingListId, setListDropIndicatorIfChanged]);
}
