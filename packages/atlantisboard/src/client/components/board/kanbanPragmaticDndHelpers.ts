import type { CardDB } from '../../store/database.js';
import { readKanbanListBodyDropData, readKanbanListColumnDropData } from '../../dnd/pragmatic/kanbanData.js';

export { moveCardBetweenListsInMap } from '../../store/kanbanDragPure.js';

export interface ResolvedCardDrop {
  readonly listId: string;
  readonly anchorCardId: string | null;
  readonly columnIntent: 'empty-column' | 'append-end' | 'above' | 'below';
}

export function fallbackDropForDraggedCard(
  cards: ReadonlyMap<string, readonly CardDB[]>,
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

function sortedCardsForList(
  cards: ReadonlyMap<string, readonly CardDB[]>,
  listId: string,
  excludeCardId: string | null,
): CardDB[] {
  const raw = [...(cards.get(listId) ?? [])].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );
  return excludeCardId == null ? raw : raw.filter((c) => c.id !== excludeCardId);
}

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

  const scroller = listBodyEl.querySelector<HTMLElement>('.board-column__virtuoso-scroller') ?? listBodyEl;
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

export function resolveCardDropTarget(
  input: Record<string, unknown> | null,
  dropTargets: readonly { readonly data: Record<string | symbol, unknown> }[],
  cards: ReadonlyMap<string, readonly CardDB[]>,
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
        return resolveListBodyDropFromPointer(listBodyEl, clientY, sorted, bodyListId, draggingCardId);
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

export function resolveListDropListId(
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
