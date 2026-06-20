import { forwardRef } from 'react';
import type { ListProps, ScrollerProps } from 'react-virtuoso';
import type { CardDB } from '../../store/database.js';

/** Mantine `pb="xs"` between Virtuoso rows (~10px). */
export const KANBAN_VIRTUOSO_ROW_GAP_PX = 10;

export const VIRTUOSO_OVERSCAN = { main: 2, reverse: 2 } as const;

/**
 * At or below this count, render cards in a normal column with `overflow-y: auto` (no Virtuoso).
 * ~20 minimal cards fit one viewport; keeps real DOM for short lists while virtualizing deeper columns.
 */
export const KANBAN_CARD_COUNT_VIRTUALIZE_THRESHOLD = 20;

/**
 * Matches SortableCard kanban layout closely so Virtuoso's initial height ≈ measured height
 * (avoids expand-then-shrink on load from `totalListHeightChanged`).
 */
export function estimateKanbanVirtuosoItemHeightPx(
  card: CardDB,
  showDescriptionPreview: boolean,
  showStartDateOnCards: boolean,
  showDueDateOnCards: boolean,
  showEndDateOnCards: boolean,
): number {
  let inner = 32;
  inner += 26;

  const hasCover = typeof card.cover === 'string' && card.cover.trim() !== '';
  if (hasCover) {
    inner += 160;
    inner += 10;
  }

  if (card.labels.length > 0) {
    inner += 8;
    inner += 22;
  }

  const hasDescription = typeof card.description === 'string' && card.description.trim() !== '';
  const descPreview = typeof card.descriptionPreview === 'string' && card.descriptionPreview.trim() !== '';

  if (showDescriptionPreview && hasDescription) {
    inner += 6;
    inner += 36;
  } else if (showDescriptionPreview && descPreview) {
    inner += 6;
    inner += 36;
  } else if (!showDescriptionPreview && (hasDescription || descPreview)) {
    inner += 6;
    inner += 20;
  }

  if (card.assignees.length > 0) {
    inner += 10;
    inner += 42;
  }

  let dateSlots = 0;
  if (showStartDateOnCards && card.startDate != null) {
    dateSlots += 1;
  }
  if (showDueDateOnCards && card.dueDate != null) {
    dateSlots += 1;
  }
  if (showEndDateOnCards && card.endDate != null) {
    dateSlots += 1;
  }
  if (dateSlots > 0) {
    inner += 10;
    inner += dateSlots === 1 ? 22 : dateSlots === 2 ? 36 : 50;
  }

  return inner + KANBAN_VIRTUOSO_ROW_GAP_PX;
}

/** Native scroller only — Virtuoso depends on this `div` for scroll metrics; wrapping it breaks virtualization. */
export const KANBAN_VIRTUOSO_SCROLLER_CLASS = 'board-column__virtuoso-scroller';

export function kanbanListBodyScroller(listBody: HTMLElement): HTMLElement {
  return listBody.querySelector<HTMLElement>(`.${KANBAN_VIRTUOSO_SCROLLER_CLASS}`) ?? listBody;
}

export const KanbanVirtuosoScroller = forwardRef<HTMLDivElement, ScrollerProps>(
  function KanbanVirtuosoScroller({ style, ...props }, ref) {
    const domProps = { ...props } as Record<string, unknown>;
    delete domProps.containerStyle;
    delete domProps.wrapperStyle;
    return <div ref={ref} {...domProps} style={style} className={KANBAN_VIRTUOSO_SCROLLER_CLASS} />;
  },
);
KanbanVirtuosoScroller.displayName = 'KanbanVirtuosoScroller';

/** Insets card rows from the list edge; Virtuoso’s List uses inline `style` so padding must merge here (scroller-only CSS padding did not shrink item layout). */
export const KanbanVirtuosoList = forwardRef<HTMLDivElement, ListProps>(
  function KanbanVirtuosoList({ style, ...props }, ref) {
    const domProps = { ...props } as Record<string, unknown>;
    delete domProps.containerStyle;
    delete domProps.wrapperStyle;
    return (
      <div
        ref={ref}
        {...domProps}
        style={
          style == null
            ? { paddingInlineEnd: 'var(--board-column-pad)' }
            : { ...style, paddingInlineEnd: 'var(--board-column-pad)' }
        }
      />
    );
  },
);
KanbanVirtuosoList.displayName = 'KanbanVirtuosoList';
