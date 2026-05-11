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
import { Carousel } from '@mantine/carousel';
import '@mantine/carousel/styles.css';
import type { EmblaCarouselType } from 'embla-carousel';
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
import './boardView.css';

const MOBILE_CAROUSEL_EDGE_PX = 44;
const MOBILE_CAROUSEL_EDGE_HOVER_MS = 420;
const MOBILE_CAROUSEL_VIRTUAL_CENTER_INDEX = 1;

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
  /** Mobile uses Mantine Carousel (active list + neighbors). */
  isMobile: boolean;
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
  isMobile,
}: KanbanViewProps) {
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
    isMobile,
    ...(boardCardPatchRef != null ? { boardCardPatchRef } : {}),
  });

  const [embla, setEmbla] = useState<EmblaCarouselType | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const carouselHostRef = useRef<HTMLDivElement | null>(null);
  const hoverDirRef = useRef<'prev' | 'next' | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const pendingRecenterRef = useRef(false);

  const totalMobileLists = mountedLists.length;

  useLayoutEffect(() => {
    if (!isMobile) {
      return;
    }
    const total = totalMobileLists;
    if (total === 0) {
      if (activeIndex !== 0) {
        setActiveIndex(0);
      }
      return;
    }
    if (activeIndex > total - 1) {
      setActiveIndex(total - 1);
    }
  }, [isMobile, totalMobileLists, activeIndex]);

  useLayoutEffect(() => {
    if (!isMobile || embla == null) {
      return;
    }
    const onSettle = (): void => {
      const selected = embla.selectedScrollSnap();
      if (selected === MOBILE_CAROUSEL_VIRTUAL_CENTER_INDEX) {
        return;
      }
      const delta = selected === 0 ? -1 : selected === 2 ? 1 : 0;
      if (delta === 0) {
        pendingRecenterRef.current = true;
        requestAnimationFrame(() => {
          if (pendingRecenterRef.current) {
            embla.scrollTo(MOBILE_CAROUSEL_VIRTUAL_CENTER_INDEX, false);
            pendingRecenterRef.current = false;
          }
        });
        return;
      }
      pendingRecenterRef.current = true;
      setActiveIndex((prev) => Math.min(Math.max(0, prev + delta), totalMobileLists - 1));
    };
    embla.on('settle', onSettle);
    // Ensure we start centered.
    embla.scrollTo(MOBILE_CAROUSEL_VIRTUAL_CENTER_INDEX, false);
    return () => {
      embla.off('settle', onSettle);
    };
  }, [isMobile, embla, totalMobileLists]);

  useLayoutEffect(() => {
    if (!isMobile || embla == null) {
      return;
    }
    if (!pendingRecenterRef.current) {
      return;
    }
    // After activeIndex swap (which changes slide content), re-center the 3-slide carousel.
    requestAnimationFrame(() => {
      embla.scrollTo(MOBILE_CAROUSEL_VIRTUAL_CENTER_INDEX, false);
      pendingRecenterRef.current = false;
    });
  }, [isMobile, embla, activeIndex]);

  const clearHoverTimer = (): void => {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  useLayoutEffect(() => {
    if (!isMobile || embla == null || draggingCardId == null) {
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
        if (hoverDirRef.current === 'prev') {
          setActiveIndex((prev) => Math.max(0, prev - 1));
          pendingRecenterRef.current = true;
        } else if (hoverDirRef.current === 'next') {
          setActiveIndex((prev) => Math.min(Math.max(0, totalMobileLists - 1), prev + 1));
          pendingRecenterRef.current = true;
        }
      }, MOBILE_CAROUSEL_EDGE_HOVER_MS);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      clearHoverTimer();
      hoverDirRef.current = null;
    };
  }, [isMobile, embla, draggingCardId, totalMobileLists]);

  const virtualSlides = useMemo(() => {
    const total = totalMobileLists;
    if (total === 0) {
      return [
        { key: 'prev', list: null as ListDB | null },
        { key: 'cur', list: null as ListDB | null },
        { key: 'next', list: null as ListDB | null },
      ] as const;
    }
    const prevIdx = activeIndex > 0 ? activeIndex - 1 : null;
    const nextIdx = activeIndex < total - 1 ? activeIndex + 1 : null;
    return [
      { key: 'prev', list: prevIdx != null ? mountedLists[prevIdx] ?? null : null },
      { key: 'cur', list: mountedLists[activeIndex] ?? null },
      { key: 'next', list: nextIdx != null ? mountedLists[nextIdx] ?? null : null },
    ] as const;
  }, [mountedLists, totalMobileLists, activeIndex]);

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
    if (isMobile) {
      for (const slot of virtualSlides) {
        add(slot.list?.id);
      }
    }
    return m;
  }, [draggingCardId, mountedLists, cardIdsByListId, isMobile, virtualSlides]);

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
    if (!isMobile || totalMobileLists <= 1) {
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
            onClick={() => setActiveIndex(idx)}
          />
        ))}
      </Box>
    );
  }, [isMobile, totalMobileLists, activeIndex]);

  if (isMobile) {
    return (
      <Box ref={carouselHostRef} className="board-page__mobile-carousel">
        {mobileIndicators}
        <Carousel
          getEmblaApi={(api) => setEmbla(api)}
          withControls={false}
          slideSize="100%"
          slideGap={LIST_HORIZONTAL_GAP_PX}
          initialSlide={MOBILE_CAROUSEL_VIRTUAL_CENTER_INDEX}
          emblaOptions={{ align: 'start' }}
          className="board-page__mobile-carousel-inner"
        >
          {virtualSlides.map((s) => {
            return (
              <Carousel.Slide key={s.key}>
                <MobileKanbanSlide
                  shouldMount={s.list != null}
                  list={s.list}
                  board={board}
                  assigneeDirectory={assigneeDirectory}
                  draggingCardId={draggingCardIdPropForListId(s.list?.id)}
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
              </Carousel.Slide>
            );
          })}
        </Carousel>
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
