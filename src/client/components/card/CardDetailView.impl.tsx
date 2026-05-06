import { type BoardDB, type CardDB } from '../../store/database.js';
import { CardDetailViewModal } from './CardDetailView/CardDetailViewModal.js';
import { useCardDetailViewController } from './CardDetailView/useCardDetailViewController.js';

export { preloadCardDetailViewPanels } from './CardDetailView/helpers.js';


interface CardDetailViewProps {
  card: CardDB;
  boardId: string;
  boardWorkspaceId?: string | null;
  boardSettings?: BoardDB['settings'];
  listId: string;
  onClose: () => void;
  onCardDuplicated?: () => void;
  /** Called after the card is removed from the API and local DB (e.g. refresh Kanban). */
  onCardDeleted?: () => void;
  /** Merges successful edits into Kanban list state (and Dexie) so tiles stay current. */
  onCardUpdated?: (card: CardDB) => void;
}

export function CardDetailView({
  card: initialCard,
  boardId,
  boardWorkspaceId,
  boardSettings,
  listId,
  onClose,
  onCardDuplicated,
  onCardDeleted,
  onCardUpdated,
}: CardDetailViewProps) {
  const controller = useCardDetailViewController({
    initialCard,
    boardId,
    boardWorkspaceId,
    boardSettings,
    onClose,
    onCardDeleted,
    onCardUpdated,
  });
  return (
    <CardDetailViewModal
      controller={controller}
      boardId={boardId}
      listId={listId}
      onClose={onClose}
      {...(onCardDuplicated != null ? { onCardDuplicated } : {})}
    />
  );
}
