import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { db, type CardDB, type ListDB } from '../../../store/database.js';
import { useBoardRuntimeStore } from '../../../store/boardRuntimeStore.js';
import { api } from '../../../utils/api.js';
import { normalizeCardFromApi, transformList } from '../../../utils/transform.js';
import { CARD_TITLE_MAX_LENGTH } from '../../../constants/cardFieldLimits.js';

interface UseSortableListActionsArgs {
  readonly list: ListDB;
  readonly boardId: string;
  readonly renameValue: string;
  readonly setRenameModalOpen: Dispatch<SetStateAction<boolean>>;
  readonly setRenameSaving: Dispatch<SetStateAction<boolean>>;
  readonly onListUpdated: (() => void) | undefined;
  readonly onKanbanCardsReload: (() => void) | undefined;
  readonly onCardUpdatedOnBoard: (card: CardDB) => void;
  readonly onCardDeletedFromBoard: (cardId: string) => void;
  readonly setColourModalCardId: Dispatch<SetStateAction<string | null>>;
  readonly renameTargetCard: CardDB | null;
  readonly renameCardTitle: string;
  readonly setRenameModalCardId: Dispatch<SetStateAction<string | null>>;
  readonly setRenameCardLoading: Dispatch<SetStateAction<boolean>>;
}

export function useSortableListActions({
  list,
  boardId,
  renameValue,
  setRenameModalOpen,
  setRenameSaving,
  onListUpdated,
  onKanbanCardsReload,
  onCardUpdatedOnBoard,
  onCardDeletedFromBoard,
  setColourModalCardId,
  renameTargetCard,
  renameCardTitle,
  setRenameModalCardId,
  setRenameCardLoading,
}: UseSortableListActionsArgs) {
  const applyListFromApi = useCallback(
    async (response: { list: unknown }): Promise<void> => {
      const next = transformList(response.list);
      await db.lists.put(next);
      onListUpdated?.();
    },
    [onListUpdated],
  );

  const handleRenameSubmit = useCallback(async (): Promise<void> => {
    const trimmed = renameValue.trim();
    if (trimmed.length === 0 || trimmed === list.name) {
      setRenameModalOpen(false);
      return;
    }
    setRenameSaving(true);
    try {
      const response = await api.updateList(list.id, { name: trimmed });
      await applyListFromApi(response);
      setRenameModalOpen(false);
      notifications.show({
        title: 'List renamed',
        message: `List is now "${trimmed}".`,
        color: 'green',
      });
    } catch (error: unknown) {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to rename list',
        color: 'red',
      });
    } finally {
      setRenameSaving(false);
    }
  }, [renameValue, list.name, list.id, setRenameModalOpen, setRenameSaving, applyListFromApi]);

  const handleSaveColor = useCallback(
    async (hex: string): Promise<void> => {
      const response = await api.updateList(list.id, { color: hex });
      await applyListFromApi(response);
      notifications.show({
        title: 'Colour saved',
        message: hex.trim().length === 0 ? 'List colour reset to theme default.' : 'List colour updated.',
        color: 'green',
      });
    },
    [list.id, applyListFromApi],
  );

  const updateBoardListsColor = useCallback(
    async (hex: string): Promise<{ updated: number; failed: number }> => {
      try {
        const response = await api.patchBoardListsBulkColor(boardId, { color: hex });
        const trimmed = hex.trim();
        await db.lists.where('boardId').equals(boardId).modify((row) => {
          if (trimmed === '') {
            delete row.color;
          } else {
            row.color = trimmed;
          }
        });
        onListUpdated?.();
        return { updated: response.updatedCount, failed: 0 };
      } catch {
        return { updated: 0, failed: 1 };
      }
    },
    [boardId, onListUpdated],
  );

  const handleApplyColorToAll = useCallback(
    async (hex: string): Promise<void> => {
      const { updated, failed } = await updateBoardListsColor(hex);
      if (failed > 0) {
        notifications.show({
          title: 'Applied with issues',
          message: `Updated ${updated} lists, ${failed} failed.`,
          color: 'yellow',
        });
        return;
      }
      notifications.show({
        title: 'Colour applied',
        message: `Applied to ${updated} lists.`,
        color: 'green',
      });
    },
    [updateBoardListsColor],
  );

  const handleRemoveColorFromAll = useCallback(async (): Promise<void> => {
    const { updated, failed } = await updateBoardListsColor('');
    if (failed > 0) {
      notifications.show({
        title: 'Removed with issues',
        message: `Updated ${updated} lists, ${failed} failed.`,
        color: 'yellow',
      });
      return;
    }
    notifications.show({
      title: 'Colour removed',
      message: `Removed custom colour from ${updated} lists.`,
      color: 'green',
    });
  }, [updateBoardListsColor]);

  const openDeleteListModal = useCallback((): void => {
    const isMobileViewport = window.innerWidth < 768;
    modals.openConfirmModal({
      title: 'Delete list?',
      centered: true,
      children: `This will permanently delete the list "${list.name}" and all cards in it. This action cannot be undone.`,
      labels: { confirm: 'Delete list', cancel: 'Cancel' },
      confirmProps: { color: 'red', size: isMobileViewport ? 'xs' : 'sm' },
      cancelProps: { size: isMobileViewport ? 'xs' : 'sm' },
      onConfirm: async () => {
        try {
          const response = await api.deleteList(list.id);
          if (!response.removed) {
            useBoardRuntimeStore.getState().removeList(list.id);
            await db.cards.where('listId').equals(list.id).delete();
            await db.lists.delete(list.id);
            onListUpdated?.();
            notifications.show({
              title: 'List removed',
              message: 'This list was already gone on the server. Your board has been updated to match.',
              color: 'green',
            });
            return;
          }
          notifications.show({
            title: 'List deleted',
            message: 'The list has been removed.',
            color: 'green',
          });
        } catch (error: unknown) {
          notifications.show({
            title: 'Error',
            message: error instanceof Error ? error.message : 'Failed to delete list',
            color: 'red',
          });
        }
      },
    });
  }, [list.id, list.name, onListUpdated]);

  const saveCardColourForId = useCallback(
    async (cardId: string, hex: string): Promise<void> => {
      try {
        const response = await api.updateCard(cardId, { color: hex });
        const updated = normalizeCardFromApi(response.card, cardId);
        onCardUpdatedOnBoard(updated);
        setColourModalCardId(null);
      } catch (error: unknown) {
        console.error('Error updating card colour:', error);
        notifications.show({
          color: 'red',
          title: 'Could not update colour',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [onCardUpdatedOnBoard, setColourModalCardId],
  );

  const updateCurrentListCardsColor = useCallback(
    async (hex: string): Promise<{ updated: number; failed: number }> => {
      try {
        const response = await api.patchBoardCardsBulkColor(boardId, { color: hex, listId: list.id });
        const trimmed = hex.trim();
        await db.cards.where('listId').equals(list.id).modify((card) => {
          if (trimmed === '') {
            delete card.color;
          } else {
            card.color = trimmed;
          }
        });
        onKanbanCardsReload?.();
        return { updated: response.updatedCount, failed: 0 };
      } catch {
        return { updated: 0, failed: 1 };
      }
    },
    [boardId, list.id, onKanbanCardsReload],
  );

  const handleApplyColorToAllInList = useCallback(
    async (hex: string): Promise<void> => {
      const { updated, failed } = await updateCurrentListCardsColor(hex);
      if (failed > 0) {
        notifications.show({
          title: 'Applied with issues',
          message: `Updated ${updated} cards, ${failed} failed.`,
          color: 'yellow',
        });
        return;
      }
      notifications.show({
        title: 'Colour applied',
        message: `Applied to ${updated} cards in this list.`,
        color: 'green',
      });
    },
    [updateCurrentListCardsColor],
  );

  const handleRemoveColorFromAllInList = useCallback(async (): Promise<void> => {
    const { updated, failed } = await updateCurrentListCardsColor('');
    if (failed > 0) {
      notifications.show({
        title: 'Removed with issues',
        message: `Updated ${updated} cards, ${failed} failed.`,
        color: 'yellow',
      });
      return;
    }
    notifications.show({
      title: 'Colour removed',
      message: `Removed card colour from ${updated} cards in this list.`,
      color: 'green',
    });
  }, [updateCurrentListCardsColor]);

  const handleRenameCardSave = useCallback(async (): Promise<void> => {
    if (renameTargetCard == null) {
      return;
    }
    const next = renameCardTitle.trim();
    if (next === '') {
      notifications.show({
        color: 'yellow',
        title: 'Title required',
        message: 'Card title cannot be empty.',
      });
      return;
    }
    if (next.length > CARD_TITLE_MAX_LENGTH) {
      notifications.show({
        color: 'red',
        title: 'Title too long',
        message: `Title cannot exceed ${CARD_TITLE_MAX_LENGTH} characters.`,
      });
      return;
    }
    if (next === renameTargetCard.title) {
      setRenameModalCardId(null);
      return;
    }
    setRenameCardLoading(true);
    try {
      const response = await api.updateCard(renameTargetCard.id, { title: next });
      const updated = normalizeCardFromApi(response.card, renameTargetCard.id);
      onCardUpdatedOnBoard(updated);
      setRenameModalCardId(null);
    } catch (error: unknown) {
      console.error('Error renaming card:', error);
      notifications.show({
        color: 'red',
        title: 'Could not rename card',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setRenameCardLoading(false);
    }
  }, [
    renameTargetCard,
    renameCardTitle,
    setRenameCardLoading,
    onCardUpdatedOnBoard,
    setRenameModalCardId,
  ]);

  const openDeleteCardForId = useCallback(
    (cardId: string): void => {
      modals.openConfirmModal({
        title: 'Delete card',
        children: 'This card will be permanently deleted, including comments, checklists, and attachments.',
        labels: { confirm: 'Delete card', cancel: 'Cancel' },
        confirmProps: { color: 'red' },
        zIndex: 520,
        onConfirm: async () => {
          try {
            await api.deleteCard(cardId);
            await db.cards.delete(cardId);
            onCardDeletedFromBoard(cardId);
            notifications.show({
              color: 'gray',
              title: 'Card deleted',
              message: 'The card has been removed.',
            });
          } catch (error: unknown) {
            console.error('Error deleting card:', error);
            notifications.show({
              color: 'red',
              title: 'Could not delete card',
              message: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        },
      });
    },
    [onCardDeletedFromBoard],
  );

  return {
    handleRenameSubmit,
    handleSaveColor,
    handleApplyColorToAll,
    handleRemoveColorFromAll,
    openDeleteListModal,
    saveCardColourForId,
    handleApplyColorToAllInList,
    handleRemoveColorFromAllInList,
    handleRenameCardSave,
    openDeleteCardForId,
  };
}
