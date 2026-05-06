import { Box } from '@mantine/core';
import type { MutableRefObject } from 'react';
import type { CardDB } from '../../../store/database.js';
import type { BoardMemberUserDisplay } from '../../../utils/loadBoardMemberUsersForDisplay.js';

export type CardDropColumnIntent = 'empty-column' | 'append-end' | 'above' | 'below';

export interface CardDropIndicatorTarget {
  readonly listId: string;
  readonly sourceListId: string;
  readonly anchorCardId: string | null;
  readonly columnIntent: CardDropColumnIntent;
  readonly boxWidth: number;
  readonly boxHeight: number;
}

export interface VirtualizedCardListProps {
  readonly cards: CardDB[];
  readonly listId: string;
  /** Max pixel height of the card viewport; list stays content-sized until this cap (overflow scroll). */
  readonly cardListMaxBodyPx: number;
  readonly showDescriptionPreview: boolean;
  readonly showStartDateOnCards: boolean;
  readonly showDueDateOnCards: boolean;
  readonly showEndDateOnCards: boolean;
  readonly assigneeDirectory?: ReadonlyMap<string, BoardMemberUserDisplay>;
  readonly draggingCardId: string | null;
  readonly dropIndicator: CardDropIndicatorTarget | null;
  readonly suppressCardOpenClickRef?: MutableRefObject<boolean>;
  readonly onOpenCard: (card: CardDB) => void;
  readonly onCardUpdatedOnBoard: (card: CardDB) => void;
  readonly onCardDeletedFromBoard: (cardId: string) => void;
  readonly showKanbanCardMenu: boolean;
  readonly kanbanCardBodyDraggable: boolean;
}

export function virtualizedCardListPropsEqual(
  prev: Readonly<VirtualizedCardListProps>,
  next: Readonly<VirtualizedCardListProps>
): boolean {
  return (
    prev.cards === next.cards &&
    prev.listId === next.listId &&
    prev.cardListMaxBodyPx === next.cardListMaxBodyPx &&
    prev.showDescriptionPreview === next.showDescriptionPreview &&
    prev.showStartDateOnCards === next.showStartDateOnCards &&
    prev.showDueDateOnCards === next.showDueDateOnCards &&
    prev.showEndDateOnCards === next.showEndDateOnCards &&
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

export function CardDropShadowIndicator({ target }: { readonly target: CardDropIndicatorTarget }) {
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

export function FooterDropIndicator({ target }: { readonly target: CardDropIndicatorTarget }) {
  return (
    <Box pb="xs" px={0}>
      <CardDropShadowIndicator target={target} />
    </Box>
  );
}
