import type { MutableRefObject } from 'react';
import { Box, Button, Group } from '@mantine/core';
import type { CardDB, BoardDB } from '../../store/database.js';
import { BoardInlineListComposer } from './BoardInlineListComposer.js';
import type { KanbanBoardEditCaps } from '../../hooks/useBoardPermissions.js';
import {
  KanbanListColumn,
  KANBAN_ADD_LIST_BUTTON_STYLES,
  LIST_HORIZONTAL_GAP_PX,
} from './KanbanView/helpers.js';
import { useKanbanViewController } from './KanbanView/useKanbanViewController.js';
import './boardView.css';

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
}

export type { KanbanBoardEditCaps };

export function KanbanView({
  board,
  onOpenCard,
  boardCardPatchRef,
  kanbanCaps,
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
    ...(boardCardPatchRef != null ? { boardCardPatchRef } : {}),
  });

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
            draggingCardId={draggingCardId}
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
