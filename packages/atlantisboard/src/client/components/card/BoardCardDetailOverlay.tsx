import { lazy, Suspense } from 'react';
import { Modal, Loader, Box, Text, Button, Stack } from '@mantine/core';
import { KB_IOS_MODAL_INNER_SAFE_CLASS } from '../../constants/iosModalSafeArea.js';
import { prefetchCardDetail, useCardDetailLoader } from '../../hooks/useCardDetailLoader.js';
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

function scheduleLowPriority(task: () => void): void {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(() => {
      task();
    });
    return;
  }
  globalThis.setTimeout(task, 120);
}

export function primeCardDetailWindow(cardId: string, seed?: CardDB): void {
  // Fast path: warm shell + local seed immediately on click.
  preloadCardDetailView();
  prefetchCardDetail(cardId, seed);

  // Heavier panel bundles are non-critical for first paint; load in low-priority batch.
  scheduleLowPriority(() => {
    void loadCardDetailViewModule().then((m) => {
      m.preloadCardDetailViewPanels();
    });
  });
}

const CardDetailViewLazy = lazy(async () => {
  const m = await loadCardDetailViewModule();
  return { default: m.CardDetailView };
});

interface BoardCardDetailOverlayProps {
  boardId: string;
  /** When set, `useBoardPermissions` skips a Dexie `boards.get` on modal open. */
  boardWorkspaceId?: string | null;
  cardId: string;
  initialCard?: CardDB;
  boardSettings?: BoardDB['settings'];
  onClose: () => void;
  onCardDuplicated?: (appliedToCurrentBoard: boolean) => void;
  onCardDeleted?: () => void;
  /** Keeps Kanban list tiles in sync when the card is edited in this modal. */
  onCardUpdated?: (card: CardDB) => void;
}

export function BoardCardDetailOverlay({
  boardId,
  boardWorkspaceId = null,
  cardId,
  initialCard,
  boardSettings,
  onClose,
  onCardDuplicated,
  onCardDeleted,
  onCardUpdated,
}: BoardCardDetailOverlayProps) {
  const { card, loading } = useCardDetailLoader(cardId, initialCard);
  const shellModalClassNames = { inner: KB_IOS_MODAL_INNER_SAFE_CLASS } as const;

  if (loading) {
    return (
      <Modal
        opened
        onClose={onClose}
        centered
        withinPortal={false}
        title={null}
        size="sm"
        transitionProps={{ duration: 0 }}
        closeButtonProps={{ 'aria-label': 'Close' }}
        classNames={shellModalClassNames}
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
        withinPortal={false}
        title="Card"
        transitionProps={{ duration: 0 }}
        closeButtonProps={{ 'aria-label': 'Close' }}
        classNames={shellModalClassNames}
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
        withinPortal={false}
        title="Card"
        transitionProps={{ duration: 0 }}
        closeButtonProps={{ 'aria-label': 'Close' }}
        classNames={shellModalClassNames}
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
          withinPortal={false}
          title={null}
          size="xl"
          transitionProps={{ duration: 0 }}
          closeButtonProps={{ 'aria-label': 'Close' }}
          classNames={shellModalClassNames}
        >
          <Box py="xl" style={{ display: 'flex', justifyContent: 'center' }}>
            <Loader size="lg" />
          </Box>
        </Modal>
      }
    >
      <CardDetailViewLazy
        key={card.id}
        card={card}
        boardId={boardId}
        boardWorkspaceId={boardWorkspaceId}
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
