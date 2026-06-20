import type { CardDB } from '../../store/database.js';
import { compareCardListOrder } from '../../../shared/utils/cardListPos.js';
import { kanbanInsertIndexForDrop } from './kanbanPragmaticDndHelpers.js';
import type { CardDropIndicatorTarget } from './VirtualizedCardList/helpers.js';

export const KANBAN_DROP_SLOT_ROW_KEY = '__kanban_drop_slot__';

export type KanbanListDisplayRow =
  | {
      readonly kind: 'card';
      readonly card: CardDB;
      /** Collapse layout but keep mounted — Virtuoso unmount kills pragmatic-dnd mid-gesture. */
      readonly dragLayoutCollapsed?: boolean;
    }
  | { readonly kind: 'drop-slot'; readonly target: CardDropIndicatorTarget };

export function kanbanListDisplayRowKey(row: KanbanListDisplayRow): string {
  if (row.kind === 'card') {
    return row.card.id;
  }
  const { anchorCardId, columnIntent } = row.target;
  return `${KANBAN_DROP_SLOT_ROW_KEY}:${anchorCardId ?? ''}:${columnIntent}`;
}

/**
 * Hide the dragging card only after a drop slot is active — avoids mobile long-press gaps
 * where the card vanishes before the grey slot renders.
 */
export function shouldHideKanbanDraggingCardInList(
  listId: string,
  draggingCardId: string | null,
  dropIndicator: CardDropIndicatorTarget | null,
): boolean {
  if (draggingCardId == null || dropIndicator == null) {
    return false;
  }
  if (dropIndicator.listId === listId) {
    return true;
  }
  return dropIndicator.sourceListId === listId;
}

/** Visible list rows during drag: collapse source card once slot is shown, insert slot at resolved index. */
export function buildKanbanListDisplayRows(
  cards: readonly CardDB[],
  listId: string,
  draggingCardId: string | null,
  dropIndicator: CardDropIndicatorTarget | null,
): KanbanListDisplayRow[] {
  const ordered = [...cards].sort(compareCardListOrder);
  const hideDraggingCard = shouldHideKanbanDraggingCardInList(listId, draggingCardId, dropIndicator);

  if (dropIndicator == null || dropIndicator.listId !== listId) {
    if (hideDraggingCard && draggingCardId != null) {
      return ordered.map((card) => ({
        kind: 'card' as const,
        card,
        ...(card.id === draggingCardId ? { dragLayoutCollapsed: true as const } : {}),
      }));
    }
    return ordered.map((card) => ({ kind: 'card' as const, card }));
  }

  const insertIndex = kanbanInsertIndexForDrop(ordered, draggingCardId ?? '', {
    anchorCardId: dropIndicator.anchorCardId,
    columnIntent: dropIndicator.columnIntent,
  });

  const rows: KanbanListDisplayRow[] = [];
  let withoutDragCursor = 0;

  for (let i = 0; i < ordered.length; i += 1) {
    const card = ordered[i]!;
    const isDragCard = hideDraggingCard && card.id === draggingCardId;

    if (isDragCard) {
      rows.push({ kind: 'card', card, dragLayoutCollapsed: true });
      if (withoutDragCursor === insertIndex) {
        rows.push({ kind: 'drop-slot', target: dropIndicator });
        withoutDragCursor += 1;
      }
      continue;
    }

    if (withoutDragCursor === insertIndex) {
      rows.push({ kind: 'drop-slot', target: dropIndicator });
    }

    rows.push({ kind: 'card', card });
    withoutDragCursor += 1;
  }

  if (withoutDragCursor === insertIndex) {
    rows.push({ kind: 'drop-slot', target: dropIndicator });
  }

  return rows;
}
