import type { CardDB } from '../../store/database.js';
import { compareCardListOrder } from '../../../shared/utils/cardListPos.js';
import { kanbanInsertIndexForDrop } from './kanbanPragmaticDndHelpers.js';
import type { CardDropIndicatorTarget } from './VirtualizedCardList/helpers.js';

export const KANBAN_DROP_SLOT_ROW_KEY = '__kanban_drop_slot__';

export type KanbanListDisplayRow =
  | { readonly kind: 'card'; readonly card: CardDB }
  | { readonly kind: 'drop-slot'; readonly target: CardDropIndicatorTarget };

export function kanbanListDisplayRowKey(row: KanbanListDisplayRow): string {
  return row.kind === 'card' ? row.card.id : KANBAN_DROP_SLOT_ROW_KEY;
}

/** Visible list rows during drag: hide source card, insert grey slot at resolved insert index. */
export function buildKanbanListDisplayRows(
  cards: readonly CardDB[],
  listId: string,
  draggingCardId: string | null,
  dropIndicator: CardDropIndicatorTarget | null,
): KanbanListDisplayRow[] {
  const visible =
    draggingCardId == null ? [...cards] : cards.filter((c) => c.id !== draggingCardId);
  const sorted = [...visible].sort(compareCardListOrder);

  if (
    draggingCardId == null ||
    dropIndicator == null ||
    dropIndicator.listId !== listId
  ) {
    return sorted.map((card) => ({ kind: 'card', card }));
  }

  const insertIndex = kanbanInsertIndexForDrop(cards, draggingCardId, {
    anchorCardId: dropIndicator.anchorCardId,
    columnIntent: dropIndicator.columnIntent,
  });

  const rows: KanbanListDisplayRow[] = [];
  for (let i = 0; i <= sorted.length; i += 1) {
    if (i === insertIndex) {
      rows.push({ kind: 'drop-slot', target: dropIndicator });
    }
    if (i < sorted.length) {
      rows.push({ kind: 'card', card: sorted[i]! });
    }
  }
  return rows;
}
