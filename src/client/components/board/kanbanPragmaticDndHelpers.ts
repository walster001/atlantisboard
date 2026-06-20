import type { CardDB } from '../../store/database.js';
import { compareCardListOrder } from '../../../shared/utils/cardListPos.js';
import { readKanbanListBodyDropData, readKanbanListColumnDropData } from '../../dnd/pragmatic/kanbanData.js';
import { insertIndexAgainstAnchor } from '../../store/kanbanDragPure.js';
import type { CardDropIndicatorTarget } from './VirtualizedCardList/helpers.js';
import { kanbanListBodyScroller } from './virtualizedCardListHelpers.js';

export interface ResolvedCardDrop {
  readonly listId: string;
  readonly anchorCardId: string | null;
  readonly columnIntent: 'empty-column' | 'append-end' | 'above' | 'below';
}

export const DEFAULT_KANBAN_CARD_DROP_METRICS = { width: 248, height: 88 } as const;

/** One measure at drag start — matches lifted drag preview sizing. */
export function kanbanCardDragMetricsFromElement(
  el: Element | null,
): { readonly width: number; readonly height: number } {
  if (el == null || typeof HTMLElement === 'undefined') {
    return DEFAULT_KANBAN_CARD_DROP_METRICS;
  }
  const cardRoot = el instanceof HTMLElement
    ? (el.closest<HTMLElement>('[data-kanban-card-id]') ?? el)
    : null;
  if (cardRoot == null) {
    return DEFAULT_KANBAN_CARD_DROP_METRICS;
  }
  const rect = cardRoot.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

/** Drop slot height = measured dragged card height (Virtuoso row estimate uses the same value). */
export function dropSlotDisplayHeightPx(measuredCardHeightPx: number): number {
  return Math.max(1, Math.round(measuredCardHeightPx));
}

/** Insert index that preserves the card's current visual position in its list. */
export function kanbanCurrentInsertIndex(listCards: readonly CardDB[], activeId: string): number {
  const ordered = [...listCards].sort(compareCardListOrder);
  const idx = ordered.findIndex((c) => c.id === activeId);
  return idx >= 0 ? idx : ordered.length;
}

/** Drop target for drag start / no-move release — keeps the card in place instead of append-end. */
export function initialCardDropForDraggedCard(
  cards: ReadonlyMap<string, readonly CardDB[]>,
  sourceListId: string,
  draggingCardId: string,
): ResolvedCardDrop {
  const ordered = [...(cards.get(sourceListId) ?? [])].sort(compareCardListOrder);
  const activeIndex = ordered.findIndex((c) => c.id === draggingCardId);
  if (activeIndex < 0) {
    const withoutActive = (cards.get(sourceListId) ?? []).filter((c) => c.id !== draggingCardId);
    return {
      listId: sourceListId,
      anchorCardId: withoutActive[withoutActive.length - 1]?.id ?? null,
      columnIntent: withoutActive.length === 0 ? 'empty-column' : 'append-end',
    };
  }
  const withoutActive = ordered.filter((c) => c.id !== draggingCardId);
  if (withoutActive.length === 0) {
    return { listId: sourceListId, anchorCardId: null, columnIntent: 'empty-column' };
  }
  if (activeIndex === 0) {
    return { listId: sourceListId, anchorCardId: withoutActive[0]!.id, columnIntent: 'above' };
  }
  return {
    listId: sourceListId,
    anchorCardId: withoutActive[activeIndex - 1]!.id,
    columnIntent: 'below',
  };
}

export function isKanbanCardDropUnchanged(
  cards: ReadonlyMap<string, readonly CardDB[]>,
  activeId: string,
  activeListId: string,
  resolved: ResolvedCardDrop,
): boolean {
  if (resolved.listId !== activeListId) {
    return false;
  }
  const targetListCards = [...(cards.get(resolved.listId) ?? [])];
  const insertIndex = kanbanInsertIndexForDrop(targetListCards, activeId, resolved);
  return insertIndex === kanbanCurrentInsertIndex(targetListCards, activeId);
}

export function cardDropIndicatorFromResolved(
  resolved: ResolvedCardDrop,
  sourceListId: string,
  metrics: { readonly width: number; readonly height: number },
): CardDropIndicatorTarget {
  return {
    listId: resolved.listId,
    sourceListId,
    anchorCardId: resolved.anchorCardId,
    columnIntent: resolved.columnIntent,
    boxWidth: metrics.width,
    boxHeight: metrics.height,
  };
}

function listCardsForDrop(
  cards: ReadonlyMap<string, readonly CardDB[]>,
  listId: string,
  excludeCardId: string | null,
): CardDB[] {
  const raw = [...(cards.get(listId) ?? [])].sort(compareCardListOrder);
  return excludeCardId == null ? raw : raw.filter((c) => c.id !== excludeCardId);
}

const KANBAN_HIT_TEST_SKIP =
  '.board-page__dnd-card-lift-preview, .board-page__dnd-drag-preview-container, [data-kanban-drop-slot]';

/** Commit uses the last hover indicator — drop-time hit tests miss under touch drag previews. */
export function resolveCardDropForCommit(
  lastIndicator: CardDropIndicatorTarget | null,
  onDropResolved: ResolvedCardDrop | null,
  cancelFallback: ResolvedCardDrop,
): ResolvedCardDrop {
  if (lastIndicator != null) {
    return {
      listId: lastIndicator.listId,
      anchorCardId: lastIndicator.anchorCardId,
      columnIntent: lastIndicator.columnIntent,
    };
  }
  return onDropResolved ?? cancelFallback;
}

/** Drop release outside any list body → revert to source position (no move). */
export function resolveCardDropOnRelease(options: {
  readonly lastIndicator: CardDropIndicatorTarget | null;
  readonly onDropTarget: ResolvedCardDrop | null;
  readonly sourceListId: string;
  readonly draggingCardId: string;
  readonly cards: ReadonlyMap<string, readonly CardDB[]>;
  readonly pointerInDropZone: boolean;
}): ResolvedCardDrop {
  const cancelTarget = initialCardDropForDraggedCard(
    options.cards,
    options.sourceListId,
    options.draggingCardId,
  );
  if (!options.pointerInDropZone) {
    return cancelTarget;
  }
  return resolveCardDropForCommit(options.lastIndicator, options.onDropTarget, cancelTarget);
}

export function isPointInClientRect(
  clientX: number,
  clientY: number,
  rect: DOMRect | { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number },
): boolean {
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

export function isPointerInKanbanDropZone(
  clientX: number | null,
  clientY: number | null,
): boolean {
  if (clientX == null || clientY == null || typeof document === 'undefined') {
    return false;
  }
  for (const body of document.querySelectorAll<HTMLElement>('[data-kanban-list-body]')) {
    if ((body.dataset.kanbanListBody?.trim() ?? '') === '') {
      continue;
    }
    const scroller = kanbanListBodyScroller(body);
    if (isPointInClientRect(clientX, clientY, scroller.getBoundingClientRect())) {
      return true;
    }
  }
  return false;
}

/** Resolve drop insert index in the same order as `moveCardBetweenListsInMap` / `cardIdsByListId`. */
export function kanbanInsertIndexForDrop(
  listCards: readonly CardDB[],
  activeId: string,
  resolved: Pick<ResolvedCardDrop, 'columnIntent' | 'anchorCardId'>,
): number {
  const ordered = [...listCards].sort(compareCardListOrder);
  const withoutActive = ordered.filter((c) => c.id !== activeId);
  if (resolved.columnIntent === 'empty-column') {
    return 0;
  }
  const anchorId = resolved.anchorCardId;
  if (resolved.columnIntent === 'append-end' || anchorId == null) {
    return withoutActive.length;
  }
  const edge = resolved.columnIntent === 'above' ? 'above' : 'below';
  return insertIndexAgainstAnchor(withoutActive, anchorId, edge);
}

function resolveListBodyDropFromPointer(
  listBodyEl: HTMLElement,
  clientX: number,
  clientY: number,
  listCardsInStoreOrder: readonly CardDB[],
  listId: string,
  draggingCardId: string | null,
): ResolvedCardDrop | null {
  const scroller = kanbanListBodyScroller(listBodyEl);
  const rect = scroller.getBoundingClientRect();
  if (!isPointInClientRect(clientX, clientY, rect)) {
    return null;
  }

  if (listCardsInStoreOrder.length === 0) {
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

  const contentY = clientY - rect.top + scroller.scrollTop;
  const totalH = Math.max(1, scroller.scrollHeight);
  const slotH = totalH / listCardsInStoreOrder.length;
  const idx = Math.min(
    listCardsInStoreOrder.length - 1,
    Math.max(0, Math.floor(contentY / Math.max(1, slotH))),
  );
  const anchor = listCardsInStoreOrder[idx];
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
  draggingCardId: string | null,
): ResolvedCardDrop | null {
  const clientX = typeof input?.clientX === 'number' ? input.clientX : null;
  const clientY = typeof input?.clientY === 'number' ? input.clientY : null;
  if (clientX != null && clientY != null) {
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      if (el.closest(KANBAN_HIT_TEST_SKIP) != null) {
        continue;
      }
      if (draggingCardId != null) {
        const skipDragCard = el.closest<HTMLElement>('[data-kanban-card-id]');
        if (skipDragCard?.dataset.kanbanCardId === draggingCardId) {
          continue;
        }
      }
      if (!(el instanceof HTMLElement)) {
        continue;
      }
      const cardEl = el.closest<HTMLElement>('[data-kanban-list-id][data-kanban-card-id]');
      const listId = cardEl?.dataset.kanbanListId?.trim() ?? '';
      const cardId = cardEl?.dataset.kanbanCardId?.trim() ?? '';
      if (
        cardEl != null &&
        listId !== '' &&
        cardId !== '' &&
        (draggingCardId == null || cardId !== draggingCardId)
      ) {
        const rect = cardEl.getBoundingClientRect();
        return {
          listId,
          anchorCardId: cardId,
          columnIntent: clientY < rect.top + rect.height / 2 ? 'above' : 'below',
        };
      }

      const listBodyEl = el.closest<HTMLElement>('[data-kanban-list-body]');
      const bodyListId = listBodyEl?.dataset.kanbanListBody?.trim() ?? '';
      if (bodyListId !== '' && listBodyEl != null) {
        const bodyDrop = resolveListBodyDropFromPointer(
          listBodyEl,
          clientX,
          clientY,
          listCardsForDrop(cards, bodyListId, draggingCardId),
          bodyListId,
          draggingCardId,
        );
        if (bodyDrop != null) {
          return bodyDrop;
        }
      }
    }

    for (const t of dropTargets) {
      const bodyTarget = readKanbanListBodyDropData(t.data as Record<string, unknown>);
      if (bodyTarget == null) {
        continue;
      }
      const bodyEl = document.querySelector<HTMLElement>(
        `[data-kanban-list-body="${CSS.escape(bodyTarget.listId)}"]`,
      );
      if (bodyEl == null) {
        continue;
      }
      const scroller = kanbanListBodyScroller(bodyEl);
      if (!isPointInClientRect(clientX, clientY, scroller.getBoundingClientRect())) {
        continue;
      }
      const bodyDrop = resolveListBodyDropFromPointer(
        bodyEl,
        clientX,
        clientY,
        listCardsForDrop(cards, bodyTarget.listId, draggingCardId),
        bodyTarget.listId,
        draggingCardId,
      );
      if (bodyDrop != null) {
        return bodyDrop;
      }
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
