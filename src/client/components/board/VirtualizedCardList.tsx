import {
  memo,
  useCallback,
  useMemo,
  useState,
  useLayoutEffect,
  useRef,
} from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Box } from '@mantine/core';
import { SortableCard } from './SortableCard.js';
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { PDND_KANBAN_LIST_BODY } from '../../dnd/pragmatic/kanbanData.js';
import {
  estimateKanbanVirtuosoItemHeightPx,
  KANBAN_CARD_COUNT_VIRTUALIZE_THRESHOLD,
  KANBAN_VIRTUOSO_ROW_GAP_PX,
  KanbanVirtuosoList,
  KanbanVirtuosoScroller,
  VIRTUOSO_OVERSCAN,
} from './virtualizedCardListHelpers.js';
import { dropSlotDisplayHeightPx } from './kanbanPragmaticDndHelpers.js';
import {
  CardDropShadowIndicator,
  type VirtualizedCardListProps,
  virtualizedCardListPropsEqual,
} from './VirtualizedCardList/helpers.js';
import {
  buildKanbanListDisplayRows,
  kanbanListDisplayRowKey,
  shouldHideKanbanDraggingCardInList,
  type KanbanListDisplayRow,
} from './kanbanListDisplayRows.js';
import { KANBAN_DRAG_LAYOUT_COLLAPSED_HEIGHT_PX } from './kanbanMobileDragState.js';

export type { CardDropColumnIntent, CardDropIndicatorTarget } from './VirtualizedCardList/helpers.js';

function VirtualizedCardListInner({
  cards,
  listId,
  cardListMaxBodyPx,
  showDescriptionPreview,
  showStartDateOnCards,
  showDueDateOnCards,
  showEndDateOnCards,
  assigneeDirectory,
  draggingCardId = null,
  dropIndicator = null,
  suppressCardOpenClickRef,
  onOpenCard,
  onCardUpdatedOnBoard,
  onCardDeletedFromBoard,
  showKanbanCardMenu,
  kanbanCardBodyDraggable,
  kanbanCardTouchDragRequiresLongPress = false,
}: VirtualizedCardListProps) {
  const listBodyDropCleanupRef = useRef<(() => void) | null>(null);
  const setListBodyDropRef = useCallback(
    (node: HTMLDivElement | null): void => {
      listBodyDropCleanupRef.current?.();
      listBodyDropCleanupRef.current = null;
      if (node == null) {
        return;
      }
      listBodyDropCleanupRef.current = dropTargetForElements({
        element: node,
        getDropEffect: () => 'move',
        getData: () =>
          ({
            pdnd: PDND_KANBAN_LIST_BODY,
            kind: 'kanban-list-body',
            listId,
          }) as const,
        getIsSticky: () => true,
      });
    },
    [listId],
  );

  const measureRafRef = useRef<number | null>(null);
  const maxBodyPx = cardListMaxBodyPx;
  const [measuredTotalListPx, setMeasuredTotalListPx] = useState(0);

  const displayRows = useMemo(
    () => buildKanbanListDisplayRows(cards, listId, draggingCardId, dropIndicator),
    [cards, listId, draggingCardId, dropIndicator],
  );

  const hideDraggingCardInList = useMemo(
    () => shouldHideKanbanDraggingCardInList(listId, draggingCardId, dropIndicator),
    [listId, draggingCardId, dropIndicator],
  );

  const cardRowsOnly = useMemo(
    () => displayRows.filter((row): row is Extract<KanbanListDisplayRow, { kind: 'card' }> => row.kind === 'card'),
    [displayRows],
  );

  /** Card membership only — do not remount Virtuoso when the drop slot moves during drag. */
  const cardMembershipSignature = useMemo(
    () => cards.map((c) => c.id).join('\u001f'),
    [cards],
  );

  const usePlainScroll =
    kanbanCardTouchDragRequiresLongPress ||
    (cardRowsOnly.length > 0 && cardRowsOnly.length <= KANBAN_CARD_COUNT_VIRTUALIZE_THRESHOLD);

  /**
   * Swiper’s `swiper-no-swiping` blocks *all* carousel gestures starting on the list — including
   * horizontal column changes. On the mobile carousel we rely on `touch-action: pan-x pan-y`
   * (boardView.css) + long-press card drag instead, so horizontal swipes can reach Swiper.
   */
  const listBodySwiperNoSwipingClass = kanbanCardTouchDragRequiresLongPress ? '' : ' swiper-no-swiping';

  useLayoutEffect(() => {
    if (usePlainScroll) {
      return undefined;
    }
    setMeasuredTotalListPx(0);
    return () => {
      if (measureRafRef.current != null) {
        cancelAnimationFrame(measureRafRef.current);
        measureRafRef.current = null;
      }
    };
  }, [cardMembershipSignature, usePlainScroll]);

  const heightEstimates = useMemo(
    () =>
      displayRows.map((row) => {
        if (row.kind === 'drop-slot') {
          return dropSlotDisplayHeightPx(row.target.boxHeight) + KANBAN_VIRTUOSO_ROW_GAP_PX;
        }
        if (row.dragLayoutCollapsed === true) {
          return KANBAN_DRAG_LAYOUT_COLLAPSED_HEIGHT_PX;
        }
        return estimateKanbanVirtuosoItemHeightPx(
          row.card,
          showDescriptionPreview,
          showStartDateOnCards,
          showDueDateOnCards,
          showEndDateOnCards,
        );
      }),
    [
      displayRows,
      showDescriptionPreview,
      showStartDateOnCards,
      showDueDateOnCards,
      showEndDateOnCards,
    ],
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
    if (measureRafRef.current != null) {
      cancelAnimationFrame(measureRafRef.current);
    }
    measureRafRef.current = requestAnimationFrame(() => {
      measureRafRef.current = null;
      const rounded = Math.round(nh);
      setMeasuredTotalListPx((prev) => {
        if (prev > 0 && Math.abs(prev - rounded) < 8) {
          return prev;
        }
        return rounded;
      });
    });
  }, []);

  const blendedListHeightPx =
    displayRows.length === 0 ? 0 : Math.max(heightEstimatePx, measuredTotalListPx);

  const virtuosoHeightPx =
    displayRows.length === 0
      ? 0
      : Math.max(72, Math.ceil(Math.min(blendedListHeightPx, maxBodyPx)));

  const virtuosoRootStyle = useMemo(
    () =>
      ({
        height: virtuosoHeightPx,
        width: '100%',
        flexShrink: 0,
      }) as const,
    [virtuosoHeightPx],
  );

  const renderDisplayRow = useCallback(
    (row: KanbanListDisplayRow) => {
      if (row.kind === 'drop-slot') {
        return (
          <Box pb="xs" px={0} data-kanban-drop-slot="true" style={{ pointerEvents: 'none' }}>
            <CardDropShadowIndicator target={row.target} />
          </Box>
        );
      }
      const card = row.card;
      const isDragSource = hideDraggingCardInList && draggingCardId === card.id;
      const sortableCard = (
        <SortableCard
          card={card}
          listId={listId}
          showDescriptionPreview={showDescriptionPreview}
          showStartDateOnCards={showStartDateOnCards}
          showDueDateOnCards={showDueDateOnCards}
          showEndDateOnCards={showEndDateOnCards}
          showKanbanCardMenu={showKanbanCardMenu}
          kanbanCardBodyDraggable={kanbanCardBodyDraggable}
          {...(kanbanCardTouchDragRequiresLongPress ? { kanbanCardTouchDragRequiresLongPress: true } : {})}
          {...(assigneeDirectory != null ? { assigneeDirectory } : {})}
          isDragSource={isDragSource}
          {...(suppressCardOpenClickRef != null ? { suppressCardOpenClickRef } : {})}
          onOpenCard={onOpenCard}
          onCardUpdatedOnBoard={onCardUpdatedOnBoard}
          onCardDeletedFromBoard={onCardDeletedFromBoard}
        />
      );
      if (row.dragLayoutCollapsed === true) {
        return (
          <Box
            px={0}
            style={{
              height: KANBAN_DRAG_LAYOUT_COLLAPSED_HEIGHT_PX,
              minHeight: KANBAN_DRAG_LAYOUT_COLLAPSED_HEIGHT_PX,
              overflow: 'hidden',
              margin: 0,
              padding: 0,
              pointerEvents: 'none',
            }}
            aria-hidden
          >
            {sortableCard}
          </Box>
        );
      }
      return <Box pb="xs" px={0}>{sortableCard}</Box>;
    },
    [
      listId,
      hideDraggingCardInList,
      draggingCardId,
      showDescriptionPreview,
      showStartDateOnCards,
      showDueDateOnCards,
      showEndDateOnCards,
      showKanbanCardMenu,
      kanbanCardBodyDraggable,
      kanbanCardTouchDragRequiresLongPress,
      assigneeDirectory,
      suppressCardOpenClickRef,
      onOpenCard,
      onCardUpdatedOnBoard,
      onCardDeletedFromBoard,
    ],
  );

  const itemContent = useCallback(
    (_index: number, row: KanbanListDisplayRow) => renderDisplayRow(row),
    [renderDisplayRow],
  );

  if (usePlainScroll) {
    return (
      <Box
        ref={setListBodyDropRef}
        className={`board-column__cards board-column__cards--plain${listBodySwiperNoSwipingClass}`}
        style={{
          flex: '0 1 auto',
          minHeight: 0,
          maxHeight: maxBodyPx,
          display: 'flex',
          flexDirection: 'column',
        }}
        data-kanban-list-body={listId}
      >
        {displayRows.map((row) => (
          <Box key={kanbanListDisplayRowKey(row)}>{renderDisplayRow(row)}</Box>
        ))}
      </Box>
    );
  }

  if (displayRows.length === 0) {
    return (
      <Box
        ref={setListBodyDropRef}
        className={`board-column__cards board-column__cards--virtual${listBodySwiperNoSwipingClass}`}
        style={{
          flex: '0 1 auto',
          minHeight: '30px',
          display: 'flex',
          flexDirection: 'column',
        }}
        data-kanban-list-body={listId}
      />
    );
  }

  return (
    <Box
      ref={setListBodyDropRef}
      className={`board-column__cards board-column__cards--virtual${listBodySwiperNoSwipingClass}`}
      style={{
        flex: '0 1 auto',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
      data-kanban-list-body={listId}
    >
      <Virtuoso
        key={cardMembershipSignature}
        style={virtuosoRootStyle}
        data={displayRows}
        computeItemKey={(_index, row) => kanbanListDisplayRowKey(row)}
        defaultItemHeight={defaultItemHeight}
        heightEstimates={heightEstimates}
        totalListHeightChanged={onTotalListHeightChanged}
        itemContent={itemContent}
        components={{
          Scroller: KanbanVirtuosoScroller,
          List: KanbanVirtuosoList,
        }}
        overscan={VIRTUOSO_OVERSCAN}
      />
    </Box>
  );
}

export const VirtualizedCardList = memo(VirtualizedCardListInner, virtualizedCardListPropsEqual);
VirtualizedCardList.displayName = 'VirtualizedCardList';
