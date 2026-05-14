import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
  type MutableRefObject,
} from 'react';
import { Box, Button, Group } from '@mantine/core';
import type { Swiper as SwiperClass } from 'swiper';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import type { CardDB, BoardDB, ListDB } from '../../store/database.js';
import { useShallow } from 'zustand/react/shallow';
import { useBoardRuntimeStore } from '../../store/boardRuntimeStore.js';
import { BoardInlineListComposer } from './BoardInlineListComposer.js';
import type { KanbanBoardEditCaps } from '../../hooks/useBoardPermissions.js';
import type { CardDropIndicatorTarget } from './VirtualizedCardList.js';
import {
  KanbanListColumn,
  KANBAN_ADD_LIST_BUTTON_STYLES,
  LIST_HORIZONTAL_GAP_PX,
  type ListDropIndicatorTarget,
} from './KanbanView/helpers.js';
import { useKanbanViewController } from './KanbanView/useKanbanViewController.js';
import type { ResponsiveTier } from '../../hooks/useResponsiveTier.js';
import { getBoardListColumnWidthPx } from '../../utils/boardListColumnWidth.js';
import './boardView.css';

const MOBILE_CAROUSEL_EDGE_PX = 44;
const MOBILE_CAROUSEL_EDGE_HOVER_MS = 420;

/** Swiper: lower threshold / longSwipesRatio = less horizontal travel to change columns. */
const MOBILE_CAROUSEL_SWIPER_THRESHOLD_PX = 4;
const MOBILE_CAROUSEL_SWIPER_TOUCH_RATIO = 1.2;
const MOBILE_CAROUSEL_SWIPER_LONG_SWIPES_RATIO = 0.34;

interface KanbanViewProps {
  /** Supplied by `BoardPage` so this view does not subscribe separately to `s.board`. */
  board: BoardDB;
  onOpenCard: (card: CardDB) => void;
  /**
   * Assigned to the same patch used for socket `card:updated` so the card detail overlay can
   * refresh list tiles (description, due date, assignees, cover, labels) without waiting for sockets.
   */
  boardCardPatchRef?: MutableRefObject<((card: CardDB) => void) | null>;
  /** List/card menus and add-list/add-card — hidden until loaded, then from granular board keys. */
  kanbanCaps: KanbanBoardEditCaps;
  /** `mobile` / `tablet`: Swiper carousel; `desktop`: horizontal columns + windowing. */
  responsiveTier: ResponsiveTier;
}

export type { KanbanBoardEditCaps };

type MobileKanbanSlideInnerProps = {
  readonly shouldMount: boolean;
  readonly list: ListDB | null;
  readonly board: BoardDB;
  readonly assigneeDirectory: ReturnType<typeof import('../../hooks/useBoardAssigneeDirectory.js').useBoardAssigneeDirectory>;
  readonly draggingCardId: string | null;
  readonly draggingListId: string | null;
  readonly cardListMaxBodyPx: number;
  readonly suppressCardOpenClickRef: MutableRefObject<boolean>;
  readonly cardDropIndicator: CardDropIndicatorTarget | null;
  readonly listDropIndicator: ListDropIndicatorTarget | null;
  readonly kanbanCaps: KanbanBoardEditCaps;
  readonly onOpenCard: (card: CardDB) => void;
  readonly onCardCreated: (listId: string, card: CardDB) => void;
  readonly onListUpdated: () => Promise<void>;
  readonly onCardUpdatedOnBoard: (card: CardDB) => void;
  readonly onCardDeletedFromBoard: (cardId: string) => void;
  readonly onKanbanCardsReload: () => void;
};

const MobileKanbanSlide = memo(function MobileKanbanSlide({
  shouldMount,
  list,
  board,
  assigneeDirectory,
  draggingCardId,
  draggingListId,
  cardListMaxBodyPx,
  suppressCardOpenClickRef,
  cardDropIndicator,
  listDropIndicator,
  kanbanCaps,
  onOpenCard,
  onCardCreated,
  onListUpdated,
  onCardUpdatedOnBoard,
  onCardDeletedFromBoard,
  onKanbanCardsReload,
}: MobileKanbanSlideInnerProps) {
  return (
    <Box className="board-page__mobile-carousel-slide">
      {shouldMount && list != null ? (
        <KanbanListColumn
          list={list}
          board={board}
          assigneeDirectory={assigneeDirectory}
          draggingCardId={draggingCardId}
          draggingListId={draggingListId}
          boardId={board.id}
          cardListMaxBodyPx={cardListMaxBodyPx}
          suppressCardOpenClickRef={suppressCardOpenClickRef}
          cardDropIndicator={cardDropIndicator != null && cardDropIndicator.listId === list.id ? cardDropIndicator : null}
          listReorderTarget={
            draggingListId != null &&
            listDropIndicator != null &&
            listDropIndicator.overListId === list.id
          }
          onCardCreated={onCardCreated}
          onListUpdated={onListUpdated}
          onOpenCard={onOpenCard}
          onCardUpdatedOnBoard={onCardUpdatedOnBoard}
          onCardDeletedFromBoard={onCardDeletedFromBoard}
          onKanbanCardsReload={onKanbanCardsReload}
          kanbanCaps={kanbanCaps}
          kanbanCardTouchDragRequiresLongPress
        />
      ) : (
        <Box aria-hidden style={{ minHeight: 280 }} />
      )}
    </Box>
  );
});

export function KanbanView({
  board,
  onOpenCard,
  boardCardPatchRef,
  kanbanCaps,
  responsiveTier,
}: KanbanViewProps) {
  const isSwipeKanban = responsiveTier === 'mobile' || responsiveTier === 'tablet';
  const {
    assigneeDirectory,
    draggingCardId,
    draggingListId,
    addListComposerOpen,
    cardListMaxBodyPx,
    cardDropIndicator,
    listDropIndicator,
    suppressCardOpenClickRef,
    mountedLists,
    leftSpacerPx,
    rightSpacerPx,
    visibleEnd,
    totalListCount,
    listColumnChrome,
    getNextListPosition,
    closeAddListComposer,
    openAddListComposer,
    setColumnsGroupRef,
    handleColumnsClickCapture,
    handleCardCreated,
    handleListCreated,
    handleListUpdated,
    patchCardInBoardState,
    removeCardFromBoardState,
    handleKanbanCardsReload,
  } = useKanbanViewController({
    board,
    kanbanCaps,
    responsiveTier,
    ...(boardCardPatchRef != null ? { boardCardPatchRef } : {}),
  });

  const [activeIndex, setActiveIndex] = useState(0);
  const carouselHostRef = useRef<HTMLDivElement | null>(null);
  const carouselRoCleanupRef = useRef<(() => void) | null>(null);
  const [carouselHostWidth, setCarouselHostWidth] = useState(0);
  const bindMobileCarouselHostRef = useCallback(
    (node: HTMLDivElement | null) => {
      carouselRoCleanupRef.current?.();
      carouselRoCleanupRef.current = null;
      carouselHostRef.current = node;
      setColumnsGroupRef(node);
      if (node == null) {
        setCarouselHostWidth(0);
        return;
      }
      const ro = new ResizeObserver(() => {
        setCarouselHostWidth(node.clientWidth);
      });
      ro.observe(node);
      setCarouselHostWidth(node.clientWidth);
      carouselRoCleanupRef.current = (): void => {
        ro.disconnect();
      };
    },
    [setColumnsGroupRef],
  );
  const swiperRef = useRef<SwiperClass | null>(null);
  const hoverDirRef = useRef<'prev' | 'next' | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  const totalMobileLists = mountedLists.length;

  const carouselLayout = useMemo((): { readonly slidesPerView: 1 | 2; readonly maxActiveIndex: number } => {
    const gap = LIST_HORIZONTAL_GAP_PX;
    const total = totalMobileLists;
    const prefer = getBoardListColumnWidthPx(board);
    const avail = Math.max(0, carouselHostWidth);
    if (total === 0) {
      return { slidesPerView: 1, maxActiveIndex: 0 };
    }
    const baseMax = Math.max(0, total - 1);
    if (responsiveTier !== 'tablet' || total < 2 || avail === 0) {
      return { slidesPerView: 1, maxActiveIndex: baseMax };
    }
    if (prefer * 2 + gap <= avail) {
      return { slidesPerView: 2, maxActiveIndex: Math.max(0, total - 2) };
    }
    return { slidesPerView: 1, maxActiveIndex: baseMax };
  }, [board, totalMobileLists, responsiveTier, carouselHostWidth]);

  useLayoutEffect(() => {
    if (!isSwipeKanban) {
      return;
    }
    const total = totalMobileLists;
    if (total === 0) {
      if (activeIndex !== 0) {
        setActiveIndex(0);
      }
      return;
    }
    if (activeIndex > carouselLayout.maxActiveIndex) {
      setActiveIndex(carouselLayout.maxActiveIndex);
    }
  }, [isSwipeKanban, totalMobileLists, activeIndex, carouselLayout.maxActiveIndex]);

  useLayoutEffect(() => {
    if (!isSwipeKanban) {
      return;
    }
    const sw = swiperRef.current;
    if (sw == null || totalMobileLists === 0) {
      return;
    }
    const clamped = Math.min(activeIndex, carouselLayout.maxActiveIndex);
    if (sw.activeIndex !== clamped) {
      sw.slideTo(clamped, 0);
    }
  }, [isSwipeKanban, activeIndex, totalMobileLists, carouselLayout.maxActiveIndex]);

  const clearHoverTimer = (): void => {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  useLayoutEffect(() => {
    if (!isSwipeKanban || draggingCardId == null) {
      clearHoverTimer();
      hoverDirRef.current = null;
      return;
    }

    const onMove = (ev: PointerEvent): void => {
      const host = carouselHostRef.current;
      if (host == null) {
        return;
      }
      const r = host.getBoundingClientRect();
      const leftEdge = r.left + MOBILE_CAROUSEL_EDGE_PX;
      const rightEdge = r.right - MOBILE_CAROUSEL_EDGE_PX;
      const dir =
        ev.clientX <= leftEdge ? 'prev' : ev.clientX >= rightEdge ? 'next' : null;

      if (dir == null) {
        clearHoverTimer();
        hoverDirRef.current = null;
        return;
      }
      if (hoverDirRef.current === dir && hoverTimerRef.current != null) {
        return;
      }

      clearHoverTimer();
      hoverDirRef.current = dir;
      hoverTimerRef.current = window.setTimeout(() => {
        hoverTimerRef.current = null;
        const sw = swiperRef.current;
        if (sw == null) {
          return;
        }
        if (hoverDirRef.current === 'prev') {
          sw.slidePrev();
        } else if (hoverDirRef.current === 'next') {
          sw.slideNext();
        }
      }, MOBILE_CAROUSEL_EDGE_HOVER_MS);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      clearHoverTimer();
      hoverDirRef.current = null;
    };
  }, [isSwipeKanban, draggingCardId, totalMobileLists]);

  const cardIdsByListId = useBoardRuntimeStore(useShallow((s) => s.cardIdsByListId));

  /**
   * Only the list that currently *contains* the dragged card should receive a non-null
   * `draggingCardId` prop — others keep `null` so memoized columns do not re-render on every
   * drag start/move/drop (global state alone would change every column's props).
   */
  const draggingCardIdScopedByListId = useMemo((): ReadonlyMap<string, string | null> | null => {
    if (draggingCardId == null) {
      return null;
    }
    const m = new Map<string, string | null>();
    const add = (listId: string | undefined): void => {
      if (listId == null || listId === '' || m.has(listId)) {
        return;
      }
      const ids = cardIdsByListId[listId] ?? [];
      m.set(listId, ids.includes(draggingCardId) ? draggingCardId : null);
    };
    for (const list of mountedLists) {
      add(list.id);
    }
    return m;
  }, [draggingCardId, mountedLists, cardIdsByListId]);

  const draggingCardIdPropForListId = useCallback(
    (listId: string | undefined): string | null => {
      if (listId == null || listId === '' || draggingCardIdScopedByListId == null) {
        return null;
      }
      return draggingCardIdScopedByListId.get(listId) ?? null;
    },
    [draggingCardIdScopedByListId],
  );

  const mobileIndicators = useMemo(() => {
    if (!isSwipeKanban || totalMobileLists <= 1) {
      return null;
    }
    return (
      <Box className="board-page__mobile-carousel-indicators" aria-label="Lists">
        {Array.from({ length: totalMobileLists }).map((_, idx) => (
          <button
            key={idx}
            type="button"
            className={
              idx === activeIndex
                ? 'board-page__mobile-carousel-dot board-page__mobile-carousel-dot--active'
                : 'board-page__mobile-carousel-dot'
            }
            aria-label={`Go to list ${idx + 1}`}
            onClick={() => {
              swiperRef.current?.slideTo(idx);
            }}
          />
        ))}
      </Box>
    );
  }, [isSwipeKanban, totalMobileLists, activeIndex]);

  if (isSwipeKanban) {
    const mobileListIdsKey = mountedLists.map((l) => l.id).join(',');
    const swiperKey = `${mobileListIdsKey}-s${carouselLayout.slidesPerView}`;
    return (
      <Box
        ref={bindMobileCarouselHostRef}
        className="board-page__mobile-carousel"
        onClickCapture={handleColumnsClickCapture}
      >
        {mobileIndicators}
        {totalMobileLists === 0 ? (
          <Box aria-hidden style={{ minHeight: 280 }} />
        ) : (
          <Swiper
            key={swiperKey}
            className="board-page__mobile-carousel-inner board-page__mobile-carousel-swiper"
            slidesPerView={carouselLayout.slidesPerView}
            spaceBetween={LIST_HORIZONTAL_GAP_PX}
            grabCursor
            touchRatio={MOBILE_CAROUSEL_SWIPER_TOUCH_RATIO}
            threshold={MOBILE_CAROUSEL_SWIPER_THRESHOLD_PX}
            longSwipesRatio={MOBILE_CAROUSEL_SWIPER_LONG_SWIPES_RATIO}
            speed={220}
            touchAngle={30}
            touchStartPreventDefault={false}
            initialSlide={Math.min(activeIndex, carouselLayout.maxActiveIndex)}
            onSwiper={(swiper) => {
              swiperRef.current = swiper;
            }}
            onSlideChange={(swiper) => {
              setActiveIndex(swiper.activeIndex);
            }}
          >
            {mountedLists.map((list) => (
              <SwiperSlide key={list.id} className="board-page__mobile-carousel-slide-outer">
                <MobileKanbanSlide
                  shouldMount
                  list={list}
                  board={board}
                  assigneeDirectory={assigneeDirectory}
                  draggingCardId={draggingCardIdPropForListId(list.id)}
                  draggingListId={draggingListId}
                  cardListMaxBodyPx={cardListMaxBodyPx}
                  suppressCardOpenClickRef={suppressCardOpenClickRef}
                  cardDropIndicator={cardDropIndicator}
                  listDropIndicator={listDropIndicator}
                  kanbanCaps={kanbanCaps}
                  onOpenCard={onOpenCard}
                  onCardCreated={handleCardCreated}
                  onListUpdated={handleListUpdated}
                  onCardUpdatedOnBoard={patchCardInBoardState}
                  onCardDeletedFromBoard={removeCardFromBoardState}
                  onKanbanCardsReload={handleKanbanCardsReload}
                />
              </SwiperSlide>
            ))}
          </Swiper>
        )}
      </Box>
    );
  }

  return (
    <Group
      ref={setColumnsGroupRef}
      gap={LIST_HORIZONTAL_GAP_PX}
      className="board-page__columns"
      wrap="nowrap"
      align="flex-start"
      onClickCapture={handleColumnsClickCapture}
    >
        {leftSpacerPx > 0 ? (
          <Box aria-hidden style={{ width: leftSpacerPx, minWidth: leftSpacerPx, height: 1, flexShrink: 0 }} />
        ) : null}
        {mountedLists.map((list) => (
          <KanbanListColumn
            key={list.id}
            list={list}
            board={board}
            assigneeDirectory={assigneeDirectory}
            draggingCardId={draggingCardIdPropForListId(list.id)}
            draggingListId={draggingListId}
            boardId={board.id}
            cardListMaxBodyPx={cardListMaxBodyPx}
            suppressCardOpenClickRef={suppressCardOpenClickRef}
            cardDropIndicator={
              cardDropIndicator != null && cardDropIndicator.listId === list.id
                ? cardDropIndicator
                : null
            }
            listReorderTarget={
              draggingListId != null &&
              listDropIndicator != null &&
              listDropIndicator.overListId === list.id
            }
            onCardCreated={handleCardCreated}
            onListUpdated={handleListUpdated}
            onOpenCard={onOpenCard}
            onCardUpdatedOnBoard={patchCardInBoardState}
            onCardDeletedFromBoard={removeCardFromBoardState}
            onKanbanCardsReload={handleKanbanCardsReload}
            kanbanCaps={kanbanCaps}
          />
        ))}

        {kanbanCaps.canAddList && visibleEnd >= totalListCount ? (
          <Box
            className={listColumnChrome.trackClassName}
            style={listColumnChrome.trackStyle}
          >
            {addListComposerOpen ? (
              <BoardInlineListComposer
                boardId={board.id}
                getNextPosition={getNextListPosition}
                onListCreated={handleListCreated}
                onCancel={closeAddListComposer}
              />
            ) : (
              <Button
                variant="default"
                className="board-page__add-list"
                justify="flex-start"
                leftSection={
                  <span className="board-page__add-list-icon" aria-hidden>
                    +
                  </span>
                }
                styles={KANBAN_ADD_LIST_BUTTON_STYLES}
                onClick={openAddListComposer}
              >
                Add another list
              </Button>
            )}
          </Box>
        ) : null}
        {rightSpacerPx > 0 ? (
          <Box
            aria-hidden
            style={{ width: rightSpacerPx, minWidth: rightSpacerPx, height: 1, flexShrink: 0 }}
          />
        ) : null}
    </Group>
  );
}
