import {
  forwardRef,
  memo,
  useCallback,
  useMemo,
  useState,
  type MutableRefObject,
} from 'react';
import { Virtuoso, type ListProps, type ScrollerProps } from 'react-virtuoso';
import { Box } from '@mantine/core';
import type { CardDB } from '../../store/database.js';
import type { BoardMemberUserDisplay } from '../../utils/loadBoardMemberUsersForDisplay.js';
import { SortableCard } from './SortableCard.js';

/** Mantine `pb="xs"` between Virtuoso rows (~10px). */
const KANBAN_VIRTUOSO_ROW_GAP_PX = 10;

const VIRTUOSO_OVERSCAN = { main: 3, reverse: 3 } as const;
const VIRTUOSO_VIEWPORT_PAD = { top: 64, bottom: 64 } as const;

/**
 * Matches SortableCard kanban layout closely so Virtuoso's initial height ≈ measured height
 * (avoids expand-then-shrink on load from `totalListHeightChanged`).
 */
function estimateKanbanVirtuosoItemHeightPx(
  card: CardDB,
  showDescriptionPreview: boolean,
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
  const descPreview =
    typeof card.descriptionPreview === 'string' && card.descriptionPreview.trim() !== '';

  if (showDescriptionPreview && hasDescription) {
    inner += 6;
    inner += 44;
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

  if (card.dueDate != null) {
    inner += 10;
    inner += 22;
  }

  return inner + KANBAN_VIRTUOSO_ROW_GAP_PX;
}

export type CardDropColumnIntent = 'empty-column' | 'append-end' | 'above' | 'below';

export interface CardDropIndicatorTarget {
  readonly listId: string;
  readonly sourceListId: string;
  readonly anchorCardId: string | null;
  readonly columnIntent: CardDropColumnIntent;
  readonly boxWidth: number;
  readonly boxHeight: number;
}

interface VirtualizedCardListProps {
  cards: CardDB[];
  listId: string;
  /** From KanbanView: single board-level resize subscription. */
  cardListMaxBodyPx: number;
  showDescriptionPreview: boolean;
  assigneeDirectory?: ReadonlyMap<string, BoardMemberUserDisplay>;
  draggingCardId: string | null;
  dropIndicator: CardDropIndicatorTarget | null;
  suppressCardOpenClickRef?: MutableRefObject<boolean>;
  onOpenCard: (card: CardDB) => void;
  onCardUpdatedOnBoard: (card: CardDB) => void;
  onCardDeletedFromBoard: (cardId: string) => void;
  showKanbanCardMenu: boolean;
  kanbanCardBodyDraggable: boolean;
}

function virtualizedCardListPropsEqual(
  prev: Readonly<VirtualizedCardListProps>,
  next: Readonly<VirtualizedCardListProps>,
): boolean {
  return (
    prev.cards === next.cards &&
    prev.listId === next.listId &&
    prev.cardListMaxBodyPx === next.cardListMaxBodyPx &&
    prev.showDescriptionPreview === next.showDescriptionPreview &&
    prev.assigneeDirectory === next.assigneeDirectory &&
    prev.draggingCardId === next.draggingCardId &&
    prev.dropIndicator === next.dropIndicator &&
    prev.suppressCardOpenClickRef === next.suppressCardOpenClickRef &&
    prev.onOpenCard === next.onOpenCard &&
    prev.onCardUpdatedOnBoard === next.onCardUpdatedOnBoard &&
    prev.onCardDeletedFromBoard === next.onCardDeletedFromBoard &&
    prev.showKanbanCardMenu === next.showKanbanCardMenu &&
    prev.kanbanCardBodyDraggable === next.kanbanCardBodyDraggable
  );
}

const KanbanVirtuosoScroller = forwardRef<HTMLDivElement, ScrollerProps>(
  function KanbanVirtuosoScroller({ style, ...props }, ref) {
    return (
      <div
        ref={ref}
        {...props}
        style={style}
        className="board-column__virtuoso-scroller"
      />
    );
  },
);
KanbanVirtuosoScroller.displayName = 'KanbanVirtuosoScroller';

/** Insets card rows from the list edge; Virtuoso’s List uses inline `style` so padding must merge here (scroller-only CSS padding did not shrink item layout). */
const KanbanVirtuosoList = forwardRef<HTMLDivElement, ListProps>(
  function KanbanVirtuosoList({ style, ...props }, ref) {
    return (
      <div
        ref={ref}
        {...props}
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

function CardDropShadowIndicator({ target }: { target: CardDropIndicatorTarget }) {
  const h = Math.max(84, Math.min(Math.max(target.boxHeight, 96), 240));
  return (
    <div className="board-card-drop-indicator-wrap">
      <div
        className="board-card-drop-indicator"
        style={{ width: '100%', minHeight: h, maxHeight: h }}
        aria-hidden
      />
    </div>
  );
}

function VirtualizedCardListInner({
  cards,
  listId,
  cardListMaxBodyPx,
  showDescriptionPreview,
  assigneeDirectory,
  draggingCardId = null,
  dropIndicator = null,
  suppressCardOpenClickRef,
  onOpenCard,
  onCardUpdatedOnBoard,
  onCardDeletedFromBoard,
  showKanbanCardMenu,
  kanbanCardBodyDraggable,
}: VirtualizedCardListProps) {
  const maxBodyPx = cardListMaxBodyPx;
  const [measuredTotalListPx, setMeasuredTotalListPx] = useState(0);

  const sortedCards = useMemo(() => {
    const visible =
      draggingCardId == null ? cards : cards.filter((c) => c.id !== draggingCardId);
    return [...visible].sort((a, b) => a.position - b.position);
  }, [cards, draggingCardId]);

  const totalListPx = sortedCards.length === 0 ? 0 : measuredTotalListPx;

  const heightEstimates = useMemo(
    () =>
      sortedCards.map((c) =>
        estimateKanbanVirtuosoItemHeightPx(c, showDescriptionPreview),
      ),
    [sortedCards, showDescriptionPreview],
  );

  const defaultItemHeight = useMemo(() => {
    if (heightEstimates.length === 0) {
      return 96;
    }
    const sample = heightEstimates.slice(0, 24);
    const avg = sample.reduce((a, h) => a + h, 0) / sample.length;
    return Math.max(72, Math.round(avg));
  }, [heightEstimates]);

  const heightEstimatePx = useMemo(() => {
    if (heightEstimates.length === 0) {
      return 0;
    }
    const total = heightEstimates.reduce((a, h) => a + h, 0);
    return Math.min(total, maxBodyPx);
  }, [heightEstimates, maxBodyPx]);

  const onTotalListHeightChanged = useCallback((nh: number) => {
    if (nh <= 0) {
      return;
    }
    setMeasuredTotalListPx((prev) => {
      if (prev > 0 && Math.abs(prev - nh) < 3) {
        return prev;
      }
      return nh;
    });
  }, []);

  const virtuosoHeightPx =
    sortedCards.length === 0
      ? 0
      : Math.max(
          72,
          Math.ceil(
            Math.min(totalListPx === 0 ? heightEstimatePx : totalListPx, maxBodyPx),
          ),
        );

  const virtuosoRootStyle = useMemo(
    () =>
      ({
        height: virtuosoHeightPx,
        width: '100%',
        flexShrink: 0,
      }) as const,
    [virtuosoHeightPx],
  );

  const listDropChrome = useMemo(() => {
    const di = dropIndicator;
    const matches = di != null && di.listId === listId;
    const showEmpty =
      matches && sortedCards.length === 0 && di != null && di.columnIntent === 'empty-column';
    const lastCardId =
      sortedCards.length > 0 ? sortedCards[sortedCards.length - 1]?.id ?? null : null;
    const showBelowLastInFooter =
      lastCardId != null &&
      di != null &&
      matches &&
      di.anchorCardId === lastCardId &&
      di.columnIntent === 'below';
    return { matches, showEmpty, lastCardId, showBelowLastInFooter, di };
  }, [dropIndicator, listId, sortedCards]);

  const virtuosoComponents = useMemo(
    () => ({
      Scroller: KanbanVirtuosoScroller,
      List: KanbanVirtuosoList,
      Header: () =>
        listDropChrome.showEmpty && listDropChrome.di != null ? (
          <Box pb="xs" px={0}>
            <CardDropShadowIndicator target={listDropChrome.di} />
          </Box>
        ) : null,
      Footer: () => {
        if (!listDropChrome.showBelowLastInFooter || listDropChrome.di == null) {
          return null;
        }
        return (
          <Box pb="xs" px={0}>
            <CardDropShadowIndicator target={listDropChrome.di} />
          </Box>
        );
      },
    }),
    [listDropChrome],
  );

  const itemContent = useCallback(
    (_index: number, card: CardDB) => {
      const { matches, lastCardId, di } = listDropChrome;
      const showAboveRow =
        di != null && matches && di.anchorCardId === card.id && di.columnIntent === 'above';
      const showBelowRow =
        di != null && matches && di.anchorCardId === card.id && di.columnIntent === 'below';
      return (
        <Box pb="xs" px={0}>
          {showAboveRow ? <CardDropShadowIndicator target={di} /> : null}
          <SortableCard
            card={card}
            listId={listId}
            showDescriptionPreview={showDescriptionPreview}
            showKanbanCardMenu={showKanbanCardMenu}
            kanbanCardBodyDraggable={kanbanCardBodyDraggable}
            {...(assigneeDirectory != null ? { assigneeDirectory } : {})}
            isDragSource={draggingCardId === card.id}
            {...(suppressCardOpenClickRef != null ? { suppressCardOpenClickRef } : {})}
            onOpenCard={onOpenCard}
            onCardUpdatedOnBoard={onCardUpdatedOnBoard}
            onCardDeletedFromBoard={onCardDeletedFromBoard}
          />
          {showBelowRow && di != null && card.id !== lastCardId ? (
            <CardDropShadowIndicator target={di} />
          ) : null}
        </Box>
      );
    },
    [
      listDropChrome,
      listId,
      draggingCardId,
      showDescriptionPreview,
      showKanbanCardMenu,
      kanbanCardBodyDraggable,
      assigneeDirectory,
      suppressCardOpenClickRef,
      onOpenCard,
      onCardUpdatedOnBoard,
      onCardDeletedFromBoard,
    ],
  );

  if (sortedCards.length === 0) {
    return (
      <Box
        className="board-column__cards board-column__cards--virtual"
        style={{
          flex: '1 1 auto',
          minHeight: '30px',
          display: 'flex',
          flexDirection: 'column',
        }}
        data-kanban-list-body={listId}
      >
        {listDropChrome.showEmpty && listDropChrome.di != null ? (
          <Box pb="xs" px={0}>
            <CardDropShadowIndicator target={listDropChrome.di} />
          </Box>
        ) : null}
      </Box>
    );
  }

  return (
    <Box
      className="board-column__cards board-column__cards--virtual"
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
      data-kanban-list-body={listId}
    >
      <Virtuoso
        style={virtuosoRootStyle}
        data={sortedCards}
        defaultItemHeight={defaultItemHeight}
        heightEstimates={heightEstimates}
        totalListHeightChanged={onTotalListHeightChanged}
        itemContent={itemContent}
        components={virtuosoComponents}
        overscan={VIRTUOSO_OVERSCAN}
        increaseViewportBy={VIRTUOSO_VIEWPORT_PAD}
      />
    </Box>
  );
}

export const VirtualizedCardList = memo(VirtualizedCardListInner, virtualizedCardListPropsEqual);
VirtualizedCardList.displayName = 'VirtualizedCardList';
