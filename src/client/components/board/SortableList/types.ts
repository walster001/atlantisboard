import type { MutableRefObject } from 'react';
import type { BoardDB, CardDB, ListDB } from '../../../store/database.js';
import type { KanbanBoardEditCaps } from '../../../hooks/useBoardPermissions.js';
import type { BoardMemberUserDisplay } from '../../../utils/loadBoardMemberUsersForDisplay.js';
import type { CardDropIndicatorTarget } from '../VirtualizedCardList.js';

export interface SortableListProps {
  readonly list: ListDB;
  readonly cards: CardDB[];
  readonly board: BoardDB;
  readonly kanbanCaps: KanbanBoardEditCaps;
  readonly assigneeDirectory?: ReadonlyMap<string, BoardMemberUserDisplay>;
  readonly draggingCardId?: string | null;
  readonly draggingListId?: string | null;
  readonly boardId: string;
  readonly cardListMaxBodyPx: number;
  readonly cardDropIndicator?: CardDropIndicatorTarget | null;
  readonly listReorderTarget?: boolean;
  readonly suppressCardOpenClickRef?: MutableRefObject<boolean>;
  readonly onCardCreated?: (listId: string, card: CardDB) => void;
  readonly onListUpdated?: () => void;
  readonly onOpenCard: (card: CardDB) => void;
  readonly onCardUpdatedOnBoard: (card: CardDB) => void;
  readonly onCardDeletedFromBoard: (cardId: string) => void;
  /** After bulk card colour API + Dexie patch, reload Kanban card state from IndexedDB. */
  readonly onKanbanCardsReload?: () => void;
}

export function sortableListPropsEqual(
  prev: Readonly<SortableListProps>,
  next: Readonly<SortableListProps>
): boolean {
  return (
    prev.list === next.list &&
    prev.board === next.board &&
    prev.cards === next.cards &&
    prev.assigneeDirectory === next.assigneeDirectory &&
    prev.draggingCardId === next.draggingCardId &&
    prev.draggingListId === next.draggingListId &&
    prev.boardId === next.boardId &&
    prev.cardListMaxBodyPx === next.cardListMaxBodyPx &&
    prev.cardDropIndicator === next.cardDropIndicator &&
    prev.listReorderTarget === next.listReorderTarget &&
    prev.suppressCardOpenClickRef === next.suppressCardOpenClickRef &&
    prev.onCardCreated === next.onCardCreated &&
    prev.onListUpdated === next.onListUpdated &&
    prev.onOpenCard === next.onOpenCard &&
    prev.onCardUpdatedOnBoard === next.onCardUpdatedOnBoard &&
    prev.onCardDeletedFromBoard === next.onCardDeletedFromBoard &&
    prev.onKanbanCardsReload === next.onKanbanCardsReload &&
    prev.kanbanCaps.canAddList === next.kanbanCaps.canAddList &&
    prev.kanbanCaps.canListMenu === next.kanbanCaps.canListMenu &&
    prev.kanbanCaps.canAddCard === next.kanbanCaps.canAddCard &&
    prev.kanbanCaps.canCardKanbanMenu === next.kanbanCaps.canCardKanbanMenu &&
    prev.kanbanCaps.canDragKanbanCards === next.kanbanCaps.canDragKanbanCards &&
    prev.kanbanCaps.canReorderLists === next.kanbanCaps.canReorderLists
  );
}
