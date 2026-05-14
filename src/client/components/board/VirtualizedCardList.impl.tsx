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
import type { CardDB } from '../../store/database.js';
import { SortableCard } from './SortableCard.js';
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { PDND_KANBAN_LIST_BODY } from '../../dnd/pragmatic/kanbanData.js';
import {
  estimateKanbanVirtuosoItemHeightPx,
  KANBAN_CARD_COUNT_VIRTUALIZE_THRESHOLD,
  KanbanVirtuosoList,
  KanbanVirtuosoScroller,
  VIRTUOSO_OVERSCAN,
} from './virtualizedCardListHelpers.js';
import {
  CardDropShadowIndicator,
  type VirtualizedCardListProps,
  virtualizedCardListPropsEqual,
} from './VirtualizedCardList/helpers.js';

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

  const sortedCards = useMemo(() => {
    const visible =
      draggingCardId == null ? cards : cards.filter((c) => c.id !== draggingCardId);
    return [...visible].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  }, [cards, draggingCardId]);

  /** When membership/order changes (e.g. bulk import), drop Virtuoso’s last measured height so we don’t size to stale totals (scrollbar glitches / layout thrash). */
  const cardRunSignature = useMemo(
    () => sortedCards.map((c) => c.id).join('\u001f'),
    [sortedCards],
  );

  const usePlainScroll =
    sortedCards.length > 0 && sortedCards.length <= KANBAN_CARD_COUNT_VIRTUALIZE_THRESHOLD;

  /**
   * Swiper’s `swiper-no-swiping` blocks *all* carousel gestures starting on the list — including
   * horizontal column changes. On mobile/tablet carousel we rely on `touch-action: pan-x pan-y`
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
  }, [cardRunSignature, usePlainScroll]);

  const heightEstimates = useMemo(
    () =>
      sortedCards.map((c) =>
        estimateKanbanVirtuosoItemHeightPx(
          c,
          showDescriptionPreview,
          showStartDateOnCards,
          showDueDateOnCards,
          showEndDateOnCards,
        ),
      ),
    [sortedCards, showDescriptionPreview, showStartDateOnCards, showDueDateOnCards, showEndDateOnCards],
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
    sortedCards.length === 0 ? 0 : Math.max(heightEstimatePx, measuredTotalListPx);

  const virtuosoHeightPx =
    sortedCards.length === 0
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
    const showAppendEndInFooter =
      sortedCards.length > 0 && di != null && matches && di.columnIntent === 'append-end';
    return { matches, showEmpty, lastCardId, showBelowLastInFooter, showAppendEndInFooter, di };
  }, [dropIndicator, listId, sortedCards]);

  const renderCardRow = useCallback(
    (card: CardDB) => {
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
            showStartDateOnCards={showStartDateOnCards}
            showDueDateOnCards={showDueDateOnCards}
            showEndDateOnCards={showEndDateOnCards}
            showKanbanCardMenu={showKanbanCardMenu}
            kanbanCardBodyDraggable={kanbanCardBodyDraggable}
            {...(kanbanCardTouchDragRequiresLongPress ? { kanbanCardTouchDragRequiresLongPress: true } : {})}
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
        if (
          (!listDropChrome.showBelowLastInFooter && !listDropChrome.showAppendEndInFooter) ||
          listDropChrome.di == null
        ) {
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
    (_index: number, card: CardDB) => renderCardRow(card),
    [renderCardRow],
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
        {sortedCards.map((card) => (
          <Box key={card.id}>{renderCardRow(card)}</Box>
        ))}
        {(listDropChrome.showBelowLastInFooter || listDropChrome.showAppendEndInFooter) &&
        listDropChrome.di != null ? (
          <Box pb="xs" px={0}>
            <CardDropShadowIndicator target={listDropChrome.di} />
          </Box>
        ) : null}
      </Box>
    );
  }

  if (sortedCards.length === 0) {
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
        style={virtuosoRootStyle}
        data={sortedCards}
        defaultItemHeight={defaultItemHeight}
        heightEstimates={heightEstimates}
        totalListHeightChanged={onTotalListHeightChanged}
        itemContent={itemContent}
        components={virtuosoComponents}
        overscan={VIRTUOSO_OVERSCAN}
      />
    </Box>
  );
}

export const VirtualizedCardList = memo(VirtualizedCardListInner, virtualizedCardListPropsEqual);
VirtualizedCardList.displayName = 'VirtualizedCardList';
