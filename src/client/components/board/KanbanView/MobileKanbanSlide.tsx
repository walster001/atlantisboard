import { memo, type MutableRefObject } from 'react';
import { Box } from '@mantine/core';
import type { CardDB, BoardDB, ListDB } from '../../../store/database.js';
import type { KanbanBoardEditCaps } from '../../../hooks/useBoardPermissions.js';
import type { CardDropIndicatorTarget } from '../VirtualizedCardList.js';
import {
  KanbanListColumn,
  type ListDropIndicatorTarget,
} from './helpers.js';

export type MobileKanbanSlideInnerProps = {
  readonly shouldMount: boolean;
  readonly list: ListDB | null;
  readonly board: BoardDB;
  readonly assigneeDirectory: ReturnType<typeof import('../../../hooks/useBoardAssigneeDirectory.js').useBoardAssigneeDirectory>;
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

export const MobileKanbanSlide = memo(function MobileKanbanSlide({
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
