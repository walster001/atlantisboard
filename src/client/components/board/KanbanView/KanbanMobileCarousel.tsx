import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type MouseEventHandler,
} from 'react';
import { flushSync } from 'react-dom';
import { Box, Button } from '@mantine/core';
import type { Swiper as SwiperClass } from 'swiper';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import type { CardDB, BoardDB, ListDB } from '../../../store/database.js';
import type { KanbanBoardEditCaps } from '../../../hooks/useBoardPermissions.js';
import type { CardDropIndicatorTarget } from '../VirtualizedCardList.js';
import { BoardInlineListComposer } from '../BoardInlineListComposer.js';
import {
  KANBAN_ADD_LIST_BUTTON_STYLES,
  LIST_HORIZONTAL_GAP_PX,
  type ListDropIndicatorTarget,
} from './helpers.js';
import { MobileKanbanSlide } from './MobileKanbanSlide.js';

const MOBILE_CAROUSEL_EDGE_PX = 52;
const MOBILE_CAROUSEL_EDGE_HOVER_MS = 320;
const MOBILE_CAROUSEL_EDGE_REPEAT_MS = 520;
const MOBILE_CAROUSEL_SWIPER_THRESHOLD_PX = 4;
const MOBILE_CAROUSEL_SWIPER_TOUCH_RATIO = 1.2;
const MOBILE_CAROUSEL_SWIPER_LONG_SWIPES_RATIO = 0.34;

export interface KanbanMobileCarouselProps {
  readonly board: BoardDB;
  readonly mountedLists: readonly ListDB[];
  readonly kanbanCaps: KanbanBoardEditCaps;
  readonly assigneeDirectory: ReturnType<typeof import('../../../hooks/useBoardAssigneeDirectory.js').useBoardAssigneeDirectory>;
  readonly draggingCardId: string | null;
  readonly draggingListId: string | null;
  readonly cardListMaxBodyPx: number;
  readonly suppressCardOpenClickRef: MutableRefObject<boolean>;
  readonly cardDropIndicator: CardDropIndicatorTarget | null;
  readonly listDropIndicator: ListDropIndicatorTarget | null;
  readonly addListComposerOpen: boolean;
  readonly carouselEdgeBumpRef: MutableRefObject<((clientX: number) => void) | null>;
  readonly setColumnsGroupRef: (node: HTMLDivElement | null) => void;
  readonly handleColumnsClickCapture: MouseEventHandler<HTMLDivElement>;
  readonly getNextListPosition: () => number;
  readonly closeAddListComposer: () => void;
  readonly openAddListComposer: () => void;
  readonly onOpenCard: (card: CardDB) => void;
  readonly onCardCreated: (listId: string, card: CardDB) => void;
  readonly onListUpdated: () => Promise<void>;
  readonly onCardUpdatedOnBoard: (card: CardDB) => void;
  readonly onCardDeletedFromBoard: (cardId: string) => void;
  readonly onKanbanCardsReload: () => void;
  readonly onListCreated: (response?: { list: unknown }) => void;
}

export function KanbanMobileCarousel({
  board,
  mountedLists,
  kanbanCaps,
  assigneeDirectory,
  draggingCardId,
  draggingListId,
  cardListMaxBodyPx,
  suppressCardOpenClickRef,
  cardDropIndicator,
  listDropIndicator,
  addListComposerOpen,
  carouselEdgeBumpRef,
  setColumnsGroupRef,
  handleColumnsClickCapture,
  getNextListPosition,
  closeAddListComposer,
  openAddListComposer,
  onOpenCard,
  onCardCreated,
  onListUpdated,
  onCardUpdatedOnBoard,
  onCardDeletedFromBoard,
  onKanbanCardsReload,
  onListCreated,
}: KanbanMobileCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const carouselHostRef = useRef<HTMLDivElement | null>(null);
  const bindMobileCarouselHostRef = useCallback(
    (node: HTMLDivElement | null) => {
      carouselHostRef.current = node;
      setColumnsGroupRef(node);
    },
    [setColumnsGroupRef],
  );
  const swiperRef = useRef<SwiperClass | null>(null);
  const hoverDirRef = useRef<'prev' | 'next' | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const edgeRepeatTimerRef = useRef<number | null>(null);

  const totalMobileLists = mountedLists.length;
  const mobileShowAddListSlide = kanbanCaps.canAddList;
  const totalMobileSlides = totalMobileLists + (mobileShowAddListSlide ? 1 : 0);

  const carouselLayout = useMemo((): { readonly slidesPerView: 1; readonly maxActiveIndex: number } => {
    const total = totalMobileSlides;
    if (total === 0) {
      return { slidesPerView: 1, maxActiveIndex: 0 };
    }
    return { slidesPerView: 1, maxActiveIndex: Math.max(0, total - 1) };
  }, [totalMobileSlides]);

  const prevSlideCountRef = useRef(totalMobileSlides);
  const prevListCountRef = useRef(totalMobileLists);
  const listOrderSignature = useMemo(
    () => mountedLists.map((list) => list.id).join('\u001f'),
    [mountedLists],
  );
  const prevListOrderSignatureRef = useRef(listOrderSignature);
  const activeListIdRef = useRef<string | null>(mountedLists[0]?.id ?? null);
  /** After mobile create: slide index of the new list (set before store update). */
  const pendingPostCreateSlideIndexRef = useRef<number | null>(null);
  const [swiperTransitionLock, setSwiperTransitionLock] = useState(false);

  const handleMobileListCreated = useCallback(
    (response?: { list: unknown }) => {
      if (response?.list == null) {
        onListCreated(response);
        return;
      }
      const targetIndex = totalMobileLists;
      pendingPostCreateSlideIndexRef.current = targetIndex;
      setSwiperTransitionLock(true);
      flushSync(() => {
        closeAddListComposer();
      });
      onListCreated(response);
    },
    [totalMobileLists, closeAddListComposer, onListCreated],
  );

  useLayoutEffect(() => {
    const pendingIndex = pendingPostCreateSlideIndexRef.current;
    const listCountIncreased = totalMobileLists > prevListCountRef.current;
    prevListCountRef.current = totalMobileLists;

    if (pendingIndex != null && listCountIncreased) {
      pendingPostCreateSlideIndexRef.current = null;
      const targetIndex = Math.min(pendingIndex, carouselLayout.maxActiveIndex);
      prevSlideCountRef.current = totalMobileSlides;
      setActiveIndex(targetIndex);
      const sw = swiperRef.current;
      if (sw != null) {
        sw.update();
        sw.slideTo(targetIndex, 0);
      }
      activeListIdRef.current = mountedLists[targetIndex]?.id ?? null;
      setSwiperTransitionLock(false);
      return;
    }

    if (totalMobileSlides === 0) {
      prevSlideCountRef.current = totalMobileSlides;
      if (activeIndex !== 0) {
        setActiveIndex(0);
      }
      return;
    }
    if (activeIndex > carouselLayout.maxActiveIndex) {
      setActiveIndex(carouselLayout.maxActiveIndex);
    }
    if (prevSlideCountRef.current !== totalMobileSlides) {
      prevSlideCountRef.current = totalMobileSlides;
      const sw = swiperRef.current;
      if (sw != null) {
        sw.update();
        const clamped = Math.min(activeIndex, carouselLayout.maxActiveIndex);
        sw.slideTo(clamped, 0);
      }
    }

    const orderChanged =
      listOrderSignature !== prevListOrderSignatureRef.current &&
      pendingPostCreateSlideIndexRef.current == null;
    prevListOrderSignatureRef.current = listOrderSignature;
    if (orderChanged && totalMobileSlides > 0) {
      const sw = swiperRef.current;
      if (sw != null) {
        const targetListId = activeListIdRef.current;
        const resolvedIndex =
          targetListId != null
            ? mountedLists.findIndex((list) => list.id === targetListId)
            : Math.min(activeIndex, carouselLayout.maxActiveIndex);
        const nextIndex =
          resolvedIndex >= 0 ? resolvedIndex : Math.min(activeIndex, carouselLayout.maxActiveIndex);
        sw.update();
        sw.slideTo(nextIndex, 0);
        activeListIdRef.current = mountedLists[nextIndex]?.id ?? null;
        if (nextIndex !== activeIndex) {
          setActiveIndex(nextIndex);
        }
      }
    }
  }, [
    totalMobileSlides,
    totalMobileLists,
    activeIndex,
    carouselLayout.maxActiveIndex,
    listOrderSignature,
    mountedLists,
  ]);

  const clearHoverTimer = (): void => {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  const clearEdgeRepeatTimer = (): void => {
    if (edgeRepeatTimerRef.current != null) {
      window.clearInterval(edgeRepeatTimerRef.current);
      edgeRepeatTimerRef.current = null;
    }
  };

  const slideCarousel = useCallback((dir: 'prev' | 'next'): void => {
    const sw = swiperRef.current;
    if (sw == null) {
      return;
    }
    if (dir === 'prev') {
      sw.slidePrev();
    } else {
      sw.slideNext();
    }
  }, []);

  const bumpCarouselAtPointer = useCallback(
    (clientX: number): void => {
      if (draggingCardId == null || totalMobileLists <= 1) {
        return;
      }
      const host = carouselHostRef.current;
      if (host == null) {
        return;
      }
      const r = host.getBoundingClientRect();
      const leftEdge = r.left + MOBILE_CAROUSEL_EDGE_PX;
      const rightEdge = r.right - MOBILE_CAROUSEL_EDGE_PX;
      const dir = clientX <= leftEdge ? 'prev' : clientX >= rightEdge ? 'next' : null;

      if (dir == null) {
        clearHoverTimer();
        clearEdgeRepeatTimer();
        hoverDirRef.current = null;
        return;
      }
      if (
        hoverDirRef.current === dir &&
        (hoverTimerRef.current != null || edgeRepeatTimerRef.current != null)
      ) {
        return;
      }

      clearHoverTimer();
      clearEdgeRepeatTimer();
      hoverDirRef.current = dir;
      hoverTimerRef.current = window.setTimeout(() => {
        hoverTimerRef.current = null;
        slideCarousel(dir);
        edgeRepeatTimerRef.current = window.setInterval(() => {
          slideCarousel(dir);
        }, MOBILE_CAROUSEL_EDGE_REPEAT_MS);
      }, MOBILE_CAROUSEL_EDGE_HOVER_MS);
    },
    [draggingCardId, totalMobileLists, slideCarousel],
  );

  useLayoutEffect(() => {
    carouselEdgeBumpRef.current = bumpCarouselAtPointer;
    return () => {
      carouselEdgeBumpRef.current = null;
    };
  }, [bumpCarouselAtPointer, carouselEdgeBumpRef]);

  useLayoutEffect(() => {
    if (draggingCardId == null) {
      clearHoverTimer();
      clearEdgeRepeatTimer();
      hoverDirRef.current = null;
      return;
    }

    const onPointerMove = (ev: PointerEvent): void => {
      bumpCarouselAtPointer(ev.clientX);
    };
    const onTouchMove = (ev: TouchEvent): void => {
      const touch = ev.touches[0];
      if (touch != null) {
        bumpCarouselAtPointer(touch.clientX);
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('touchmove', onTouchMove);
      clearHoverTimer();
      clearEdgeRepeatTimer();
      hoverDirRef.current = null;
    };
  }, [draggingCardId, bumpCarouselAtPointer]);

  const mobileIndicators = useMemo(() => {
    if (totalMobileSlides <= 1) {
      return null;
    }
    return (
      <Box className="board-page__mobile-carousel-indicators" aria-label="Lists">
        {Array.from({ length: totalMobileSlides }).map((_, idx) => (
          <button
            key={idx}
            type="button"
            className={
              idx === activeIndex
                ? 'board-page__mobile-carousel-dot board-page__mobile-carousel-dot--active'
                : 'board-page__mobile-carousel-dot'
            }
            aria-label={idx < totalMobileLists ? `Go to list ${idx + 1}` : 'New list'}
            onClick={() => {
              swiperRef.current?.slideTo(idx);
            }}
          />
        ))}
      </Box>
    );
  }, [totalMobileSlides, totalMobileLists, activeIndex]);

  return (
    <Box
      ref={bindMobileCarouselHostRef}
      className="board-page__mobile-carousel"
      onClickCapture={handleColumnsClickCapture}
    >
      {mobileIndicators}
      {totalMobileSlides === 0 ? (
        <Box aria-hidden style={{ minHeight: 280 }} />
      ) : (
        <Swiper
          className="board-page__mobile-carousel-inner board-page__mobile-carousel-swiper"
          slidesPerView={carouselLayout.slidesPerView}
          spaceBetween={LIST_HORIZONTAL_GAP_PX}
          grabCursor={draggingCardId == null}
          allowTouchMove={
            !swiperTransitionLock && draggingCardId == null && totalMobileSlides > 1
          }
          touchRatio={MOBILE_CAROUSEL_SWIPER_TOUCH_RATIO}
          threshold={MOBILE_CAROUSEL_SWIPER_THRESHOLD_PX}
          longSwipesRatio={MOBILE_CAROUSEL_SWIPER_LONG_SWIPES_RATIO}
          speed={220}
          touchAngle={30}
          touchStartPreventDefault={false}
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
          }}
          onSlideChange={(swiper) => {
            setActiveIndex(swiper.activeIndex);
            activeListIdRef.current = mountedLists[swiper.activeIndex]?.id ?? null;
          }}
        >
          {mountedLists.map((list) => (
            <SwiperSlide key={list.id} className="board-page__mobile-carousel-slide-outer">
              <MobileKanbanSlide
                shouldMount
                list={list}
                board={board}
                assigneeDirectory={assigneeDirectory}
                draggingCardId={draggingCardId}
                draggingListId={draggingListId}
                cardListMaxBodyPx={cardListMaxBodyPx}
                suppressCardOpenClickRef={suppressCardOpenClickRef}
                cardDropIndicator={cardDropIndicator}
                listDropIndicator={listDropIndicator}
                kanbanCaps={kanbanCaps}
                onOpenCard={onOpenCard}
                onCardCreated={onCardCreated}
                onListUpdated={onListUpdated}
                onCardUpdatedOnBoard={onCardUpdatedOnBoard}
                onCardDeletedFromBoard={onCardDeletedFromBoard}
                onKanbanCardsReload={onKanbanCardsReload}
              />
            </SwiperSlide>
          ))}
          {mobileShowAddListSlide ? (
            <SwiperSlide key="__add-list" className="board-page__mobile-carousel-slide-outer">
              <Box className="board-page__mobile-carousel-slide board-page__mobile-add-list-slide">
                {addListComposerOpen ? (
                  <Box className="board-page__mobile-add-list-composer">
                    <BoardInlineListComposer
                      boardId={board.id}
                      getNextPosition={getNextListPosition}
                      onListCreated={handleMobileListCreated}
                      onCancel={closeAddListComposer}
                    />
                  </Box>
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
            </SwiperSlide>
          ) : null}
        </Swiper>
      )}
    </Box>
  );
}
