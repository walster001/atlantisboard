import { useLayoutEffect, startTransition, type MutableRefObject } from 'react';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { db, type CardDB, type ListDB } from '../../store/database.js';
import { api } from '../../utils/api.js';
import { normalizeCardFromApi } from '../../utils/transform.js';
import { persistDexieCardPut } from '../../store/boardDexieCache.js';
import {
  readKanbanCardDragData,
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

function fallbackDropForDraggedCard(
  cards: Map<string, CardDB[]>,
  sourceListId: string,
  draggingCardId: string,
): ResolvedCardDrop {
  const listCards = cards.get(sourceListId) ?? [];
  const withoutActive = listCards.filter((card) => card.id !== draggingCardId);
  return {
    listId: sourceListId,
    anchorCardId: withoutActive[withoutActive.length - 1]?.id ?? null,
    columnIntent: withoutActive.length === 0 ? 'empty-column' : 'append-end',
  };
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

/**
 * Card drop resolution is intentionally **list-surface bounded** (scale plan):
 * - one `dropTargetForElements` per list body + list column + board monitor (no per-card drop targets)
 * - `elementFromPoint` when the pointer is over a mounted card row
 * - `resolveListBodyDropFromPointer` when the pointer is over list chrome / Virtuoso gaps / unmounted rows
 */
function sortedCardsForList(
  cards: Map<string, CardDB[]>,
  listId: string,
  excludeCardId: string | null,
): CardDB[] {
  const raw = [...(cards.get(listId) ?? [])].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );
  return excludeCardId == null ? raw : raw.filter((c) => c.id !== excludeCardId);
}

/** When Virtuoso unmounts rows, `elementFromPoint` often hits list chrome only — infer index from scroll + geometry. */
function resolveListBodyDropFromPointer(
  listBodyEl: HTMLElement,
  clientY: number,
  listCardsSorted: readonly CardDB[],
  listId: string,
  draggingCardId: string | null,
): ResolvedCardDrop | null {
  if (listCardsSorted.length === 0) {
    return { listId, anchorCardId: null, columnIntent: 'empty-column' };
  }

  const nodes = Array.from(
    listBodyEl.querySelectorAll<HTMLElement>('[data-kanban-list-id][data-kanban-card-id]'),
  ).filter((el) => {
    if (el.dataset.kanbanListId !== listId) {
      return false;
    }
    const cardId = el.dataset.kanbanCardId?.trim() ?? '';
    if (cardId === '') {
      return false;
    }
    if (draggingCardId != null && cardId === draggingCardId) {
      return false;
    }
    return true;
  });

  if (nodes.length > 0) {
    const rects = nodes
      .map((el) => {
        const id = el.dataset.kanbanCardId?.trim() ?? '';
        const r = el.getBoundingClientRect();
        return { id, top: r.top, bottom: r.bottom, mid: (r.top + r.bottom) / 2 };
      })
      .filter((x) => x.id !== '')
      .sort((a, b) => a.top - b.top);

    for (const r of rects) {
      if (clientY >= r.top && clientY <= r.bottom) {
        return { listId, anchorCardId: r.id, columnIntent: clientY < r.mid ? 'above' : 'below' };
      }
    }
    if (clientY < rects[0].top) {
      return { listId, anchorCardId: rects[0].id, columnIntent: 'above' };
    }
    const last = rects[rects.length - 1];
    if (last != null && clientY > last.bottom) {
      return { listId, anchorCardId: last.id, columnIntent: 'below' };
    }
    for (let i = 0; i < rects.length - 1; i += 1) {
      const a = rects[i];
      const b = rects[i + 1];
      if (a == null || b == null) {
        continue;
      }
      if (clientY > a.bottom && clientY < b.top) {
        const gapMid = (a.bottom + b.top) / 2;
        return clientY < gapMid
          ? { listId, anchorCardId: a.id, columnIntent: 'below' }
          : { listId, anchorCardId: b.id, columnIntent: 'above' };
      }
    }
  }

  const scroller =
    listBodyEl.querySelector<HTMLElement>('.board-column__virtuoso-scroller') ?? listBodyEl;
  const rect = scroller.getBoundingClientRect();
  const contentY = clientY - rect.top + scroller.scrollTop;
  const totalH = Math.max(1, scroller.scrollHeight);
  const slotH = totalH / listCardsSorted.length;
  const idx = Math.min(
    listCardsSorted.length - 1,
    Math.max(0, Math.floor(contentY / Math.max(1, slotH))),
  );
  const anchor = listCardsSorted[idx];
  if (anchor == null) {
    return null;
  }
  const slotStart = idx * slotH;
  const local = (contentY - slotStart) / Math.max(1, slotH);
  return {
    listId,
    anchorCardId: anchor.id,
    columnIntent: local < 0.5 ? 'above' : 'below',
  };
}

function resolveCardDropTarget(
  input: Record<string, unknown> | null,
  dropTargets: readonly { readonly data: Record<string | symbol, unknown> }[],
  cards: Map<string, CardDB[]>,
  draggedEl: Element | null,
  draggingCardId: string | null,
): ResolvedCardDrop | null {
  const clientX = typeof input?.clientX === 'number' ? input.clientX : null;
  const clientY = typeof input?.clientY === 'number' ? input.clientY : null;
  if (clientX != null && clientY != null) {
    const hovered = document.elementFromPoint(clientX, clientY);
    if (hovered instanceof HTMLElement) {
      const cardEl = hovered.closest<HTMLElement>('[data-kanban-list-id][data-kanban-card-id]');
      const listId = cardEl?.dataset.kanbanListId?.trim() ?? '';
      const cardId = cardEl?.dataset.kanbanCardId?.trim() ?? '';
      if (
        cardEl != null &&
        listId !== '' &&
        cardId !== '' &&
        (draggingCardId == null || cardId !== draggingCardId)
      ) {
        const rect = cardEl.getBoundingClientRect();
        const edge: 'top' | 'bottom' = clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
        return {
          listId,
          anchorCardId: cardId,
          columnIntent: edge === 'top' ? 'above' : 'below',
        };
      }

      const listBodyEl = hovered.closest<HTMLElement>('[data-kanban-list-body]');
      const bodyListId = listBodyEl?.dataset.kanbanListBody?.trim() ?? '';
      if (bodyListId !== '' && listBodyEl != null) {
        const sorted = sortedCardsForList(cards, bodyListId, draggingCardId);
        return resolveListBodyDropFromPointer(
          listBodyEl,
          clientY,
          sorted,
          bodyListId,
          draggingCardId,
        );
      }
    }
  }

  for (const t of dropTargets) {
    const rec = t.data as Record<string, unknown>;
    const bodyTarget = readKanbanListBodyDropData(rec);
    if (bodyTarget != null) {
      const sorted = sortedCardsForList(cards, bodyTarget.listId, draggingCardId);
      if (sorted.length === 0) {
        return { listId: bodyTarget.listId, anchorCardId: null, columnIntent: 'empty-column' };
      }
      if (clientY != null) {
        const bodyEl = document.querySelector<HTMLElement>(
          `[data-kanban-list-body="${CSS.escape(bodyTarget.listId)}"]`,
        );
        if (bodyEl != null) {
          return resolveListBodyDropFromPointer(
            bodyEl,
            clientY,
            sorted,
            bodyTarget.listId,
            draggingCardId,
          );
        }
      }
      return {
        listId: bodyTarget.listId,
        anchorCardId: sorted[sorted.length - 1]?.id ?? null,
        columnIntent: 'append-end',
      };
    }
  }
  if (draggedEl instanceof HTMLElement) {
    const draggedCard = draggedEl.closest<HTMLElement>('[data-kanban-list-id][data-kanban-card-id]');
    const draggedListId = draggedCard?.dataset.kanbanListId?.trim() ?? '';
    const draggedCardId = draggedCard?.dataset.kanbanCardId?.trim() ?? '';
    if (draggedListId !== '' && draggedCardId !== '') {
      const listCards = cards.get(draggedListId) ?? [];
      const withoutActive = listCards.filter((card) => card.id !== draggedCardId);
      return {
        listId: draggedListId,
        anchorCardId: withoutActive[withoutActive.length - 1]?.id ?? null,
        columnIntent: withoutActive.length === 0 ? 'empty-column' : 'append-end',
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

  useLayoutEffect(() => {
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
