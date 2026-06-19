import {
  useCallback,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react';
import { Box, Button, Group } from '@mantine/core';
import type { CardDB, BoardDB } from '../../store/database.js';
import { useShallow } from 'zustand/react/shallow';
import { useBoardRuntimeStore } from '../../store/boardRuntimeStore.js';
import { BoardInlineListComposer } from './BoardInlineListComposer.js';
import type { KanbanBoardEditCaps } from '../../hooks/useBoardPermissions.js';
import {
  KanbanListColumn,
  KANBAN_ADD_LIST_BUTTON_STYLES,
  LIST_HORIZONTAL_GAP_PX,
} from './KanbanView/helpers.js';
import { KanbanMobileCarousel } from './KanbanView/KanbanMobileCarousel.js';
import { useKanbanViewController } from './KanbanView/useKanbanViewController.js';
import type { ResponsiveTier } from '../../hooks/useResponsiveTier.js';
import './boardView.css';

interface KanbanViewProps {
  board: BoardDB;
  onOpenCard: (card: CardDB) => void;
  boardCardPatchRef?: MutableRefObject<((card: CardDB) => void) | null>;
  kanbanCaps: KanbanBoardEditCaps;
  responsiveTier: ResponsiveTier;
}

export type { KanbanBoardEditCaps };

export function KanbanView({
  board,
  onOpenCard,
  boardCardPatchRef,
  kanbanCaps,
  responsiveTier,
}: KanbanViewProps) {
  const isSwipeKanban = responsiveTier === 'mobile';
  const carouselEdgeBumpRef = useRef<((clientX: number) => void) | null>(null);
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
    carouselEdgeBumpRef,
    ...(boardCardPatchRef != null ? { boardCardPatchRef } : {}),
  });

  const cardIdsByListId = useBoardRuntimeStore(useShallow((s) => s.cardIdsByListId));

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

  if (isSwipeKanban) {
    return (
      <KanbanMobileCarousel
        board={board}
        mountedLists={mountedLists}
        kanbanCaps={kanbanCaps}
        assigneeDirectory={assigneeDirectory}
        draggingCardId={draggingCardId}
        draggingListId={draggingListId}
        cardListMaxBodyPx={cardListMaxBodyPx}
        suppressCardOpenClickRef={suppressCardOpenClickRef}
        cardDropIndicator={cardDropIndicator}
        listDropIndicator={listDropIndicator}
        addListComposerOpen={addListComposerOpen}
        carouselEdgeBumpRef={carouselEdgeBumpRef}
        setColumnsGroupRef={setColumnsGroupRef}
        handleColumnsClickCapture={handleColumnsClickCapture}
        getNextListPosition={getNextListPosition}
        closeAddListComposer={closeAddListComposer}
        openAddListComposer={openAddListComposer}
        onOpenCard={onOpenCard}
        onCardCreated={handleCardCreated}
        onListUpdated={handleListUpdated}
        onCardUpdatedOnBoard={patchCardInBoardState}
        onCardDeletedFromBoard={removeCardFromBoardState}
        onKanbanCardsReload={handleKanbanCardsReload}
        onListCreated={handleListCreated}
        draggingCardIdPropForListId={draggingCardIdPropForListId}
      />
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
        <Box className={listColumnChrome.trackClassName} style={listColumnChrome.trackStyle}>
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
