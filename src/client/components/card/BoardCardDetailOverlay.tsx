import { lazy, Suspense } from 'react';
import { Modal, Loader, Box, Text, Button, Stack } from '@mantine/core';
import { useCardDetailLoader } from '../../hooks/useCardDetailLoader.js';
import type { BoardDB, CardDB } from '../../store/database.js';

let cardDetailViewModulePromise: Promise<typeof import('./CardDetailView.js')> | undefined;

function loadCardDetailViewModule(): Promise<typeof import('./CardDetailView.js')> {
  if (cardDetailViewModulePromise === undefined) {
    cardDetailViewModulePromise = import('./CardDetailView.js');
  }
  return cardDetailViewModulePromise;
}

export function preloadCardDetailView(): void {
  void loadCardDetailViewModule();
}

const CardDetailViewLazy = lazy(async () => {
  const m = await loadCardDetailViewModule();
  return { default: m.CardDetailView };
});

interface BoardCardDetailOverlayProps {
  boardId: string;
  cardId: string;
  initialCard?: CardDB;
  boardSettings?: BoardDB['settings'];
  onClose: () => void;
  onCardDuplicated?: () => void;
  onCardDeleted?: () => void;
  /** Keeps Kanban list tiles in sync when the card is edited in this modal. */
  onCardUpdated?: (card: CardDB) => void;
}

export function BoardCardDetailOverlay({
  boardId,
  cardId,
  initialCard,
  boardSettings,
  onClose,
  onCardDuplicated,
  onCardDeleted,
  onCardUpdated,
}: BoardCardDetailOverlayProps) {
  const { card, loading } = useCardDetailLoader(cardId, initialCard);

  if (loading) {
    return (
      <Modal
        opened
        onClose={onClose}
        centered
        title={null}
        size="sm"
        transitionProps={{ duration: 0 }}
        closeButtonProps={{ 'aria-label': 'Close' }}
      >
        <Box py="xl" style={{ display: 'flex', justifyContent: 'center' }}>
          <Loader size="lg" />
        </Box>
      </Modal>
    );
  }

  if (!card) {
    return (
      <Modal
        opened
        onClose={onClose}
        centered
        title="Card"
        transitionProps={{ duration: 0 }}
        closeButtonProps={{ 'aria-label': 'Close' }}
      >
        <Stack gap="md" align="center">
          <Text c="dimmed">This card could not be loaded.</Text>
          <Button onClick={onClose}>Close</Button>
        </Stack>
      </Modal>
    );
  }

  if (card.boardId !== boardId) {
    return (
      <Modal
        opened
        onClose={onClose}
        centered
        title="Card"
        transitionProps={{ duration: 0 }}
        closeButtonProps={{ 'aria-label': 'Close' }}
      >
        <Stack gap="md" align="center">
          <Text c="dimmed">This card does not belong to this board.</Text>
          <Button onClick={onClose}>Close</Button>
        </Stack>
      </Modal>
    );
  }

  return (
    <Suspense
      fallback={
        <Modal
          opened
          onClose={onClose}
          centered
          title={null}
          size="xl"
          transitionProps={{ duration: 0 }}
          closeButtonProps={{ 'aria-label': 'Close' }}
        >
          <Box py="xl" style={{ display: 'flex', justifyContent: 'center' }}>
            <Loader size="lg" />
          </Box>
        </Modal>
      }
    >
      <CardDetailViewLazy
        card={card}
        boardId={boardId}
        listId={card.listId}
        onClose={onClose}
        {...(boardSettings !== undefined ? { boardSettings } : {})}
        {...(onCardDuplicated !== undefined ? { onCardDuplicated } : {})}
        {...(onCardDeleted !== undefined ? { onCardDeleted } : {})}
        {...(onCardUpdated !== undefined ? { onCardUpdated } : {})}
      />
    </Suspense>
  );
}
