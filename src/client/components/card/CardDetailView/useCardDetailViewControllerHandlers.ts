import { useCallback } from 'react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { CARD_TITLE_MAX_LENGTH } from '../../../constants/cardFieldLimits.js';
import { db } from '../../../store/database.js';
import { api } from '../../../utils/api.js';
import { discardPendingDescriptionMedia } from '../../../utils/descriptionPendingMedia.js';
import { normalizeCardFromApi } from '../../../utils/transform.js';
import { runBeforeDeleteAttachment } from './cardDetailAttachmentHandlers.js';
import {
  notifyCardUpdateNormalizeFailure,
  runClearDateField,
  runSaveDateField,
} from './cardDetailDateFieldHandlers.js';
import {
  buildDescriptionErrorMessage,
  runDescriptionUpdate,
} from './cardDetailDescriptionHandlers.js';
import type {
  CardDetailViewControllerHandlers,
  DateFieldKind,
  UseCardDetailViewControllerHandlersArgs,
} from './cardDetailViewHandlerTypes.js';

export type {
  CardDetailViewControllerHandlers,
  UseCardDetailViewControllerHandlersArgs,
} from './cardDetailViewHandlerTypes.js';

export function useCardDetailViewControllerHandlers({
  boardId,
  card,
  cardRef,
  descriptionEditorRef,
  pendingDescriptionMediaRef,
  title,
  due,
  start,
  end,
  onClose,
  onCardDeleted,
  syncCardToBoardAndDexie,
  setTitle,
  setIsEditing,
  setIsEditingDescription,
  setLoading,
}: UseCardDetailViewControllerHandlersArgs): CardDetailViewControllerHandlers {
  const handleUpdateTitle = useCallback(async () => {
    if (title.trim() === card.title) {
      setIsEditing(false);
      return;
    }

    const next = title.trim();
    if (next.length > CARD_TITLE_MAX_LENGTH) {
      notifications.show({
        color: 'red',
        title: 'Title too long',
        message: `Title cannot exceed ${CARD_TITLE_MAX_LENGTH} characters.`,
      });
      return;
    }
    if (!next) {
      notifications.show({
        color: 'red',
        title: 'Title required',
        message: 'Card title cannot be empty.',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await api.updateCard(card.id, { title: next });
      try {
        syncCardToBoardAndDexie(normalizeCardFromApi(response.card, card.id));
      } catch {
        notifyCardUpdateNormalizeFailure();
      }
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating card title:', error);
      setTitle(card.title);
    } finally {
      setLoading(false);
    }
  }, [card.id, card.title, setIsEditing, setLoading, setTitle, syncCardToBoardAndDexie, title]);

  const onBeforeDeleteAttachment = useCallback(
    async (attachmentId: string): Promise<void> => {
      await runBeforeDeleteAttachment({
        cardRef,
        descriptionEditorRef,
        attachmentId,
        syncCardToBoardAndDexie,
        notifyNormalizeFailure: notifyCardUpdateNormalizeFailure,
      });
    },
    [cardRef, descriptionEditorRef, syncCardToBoardAndDexie],
  );

  const handleCancelDescriptionEdit = useCallback(() => {
    discardPendingDescriptionMedia(pendingDescriptionMediaRef.current);
    setIsEditingDescription(false);
  }, [pendingDescriptionMediaRef, setIsEditingDescription]);

  const handleUpdateDescription = useCallback(async () => {
    const editor = descriptionEditorRef.current;
    setLoading(true);
    try {
      const result = await runDescriptionUpdate({
        card,
        editor,
        syncCardToBoardAndDexie,
        notifyNormalizeFailure: notifyCardUpdateNormalizeFailure,
        pendingDescriptionMedia: pendingDescriptionMediaRef.current,
      });
      if (!result.ok) {
        notifications.show({
          color: 'red',
          title: 'Description',
          message: result.reason ?? 'Could not save the description.',
        });
        return;
      }
      setIsEditingDescription(false);
    } catch (error) {
      console.error('Error updating card description:', error);
      notifications.show({
        color: 'red',
        title: 'Description',
        message: buildDescriptionErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  }, [card, descriptionEditorRef, pendingDescriptionMediaRef, setIsEditingDescription, setLoading, syncCardToBoardAndDexie]);

  const saveDate = useCallback(
    async (kind: DateFieldKind, value: string, close: () => void, label: string): Promise<void> => {
      setLoading(true);
      try {
        await runSaveDateField({
          card,
          kind,
          value,
          close,
          label,
          syncCardToBoardAndDexie,
          notifyNormalizeFailure: notifyCardUpdateNormalizeFailure,
        });
      } catch (error) {
        console.error(`Error updating ${label.toLowerCase()}:`, error);
        notifications.show({
          color: 'red',
          title: `Could not save ${label.toLowerCase()}`,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        setLoading(false);
      }
    },
    [card, setLoading, syncCardToBoardAndDexie],
  );

  const clearDate = useCallback(
    async (kind: DateFieldKind, close: () => void, label: string): Promise<void> => {
      setLoading(true);
      try {
        await runClearDateField({
          card,
          kind,
          close,
          syncCardToBoardAndDexie,
          notifyNormalizeFailure: notifyCardUpdateNormalizeFailure,
        });
      } catch (error) {
        console.error(`Error clearing ${label.toLowerCase()}:`, error);
        notifications.show({
          color: 'red',
          title: `Could not clear ${label.toLowerCase()}`,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        setLoading(false);
      }
    },
    [card, setLoading, syncCardToBoardAndDexie],
  );

  const handleSaveDueDate = useCallback(
    async () => saveDate('dueDate', due.value, () => due.setOpened(false), 'Due date'),
    [due, saveDate],
  );
  const handleClearDueDate = useCallback(
    async () => clearDate('dueDate', () => due.setOpened(false), 'Due date'),
    [clearDate, due],
  );
  const handleSaveStartDate = useCallback(
    async () => saveDate('startDate', start.value, () => start.setOpened(false), 'Start date'),
    [saveDate, start],
  );
  const handleClearStartDate = useCallback(
    async () => clearDate('startDate', () => start.setOpened(false), 'Start date'),
    [clearDate, start],
  );
  const handleSaveEndDate = useCallback(
    async () => saveDate('endDate', end.value, () => end.setOpened(false), 'End date'),
    [end, saveDate],
  );
  const handleClearEndDate = useCallback(
    async () => clearDate('endDate', () => end.setOpened(false), 'End date'),
    [clearDate, end],
  );

  const handleCopyCardLink = useCallback(async () => {
    try {
      const path = `/boards/${boardId}?card=${encodeURIComponent(card.id)}`;
      const text = `${window.location.origin}${path}`;
      await navigator.clipboard.writeText(text);
      notifications.show({
        color: 'teal',
        title: 'Link copied',
        message: 'Only people who can access this board can open the link.',
      });
    } catch {
      notifications.show({
        color: 'red',
        title: 'Could not copy link',
        message: 'Clipboard access was denied or is unavailable.',
      });
    }
  }, [boardId, card.id]);

  const handleDeleteCard = useCallback(() => {
    modals.openConfirmModal({
      title: 'Delete card',
      children: 'This card will be permanently deleted, including comments, checklists, and attachments.',
      labels: { confirm: 'Delete card', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        setLoading(true);
        try {
          await api.deleteCard(card.id);
          await db.cards.delete(card.id);
          onCardDeleted?.();
          onClose();
        } catch (error) {
          console.error('Error deleting card:', error);
          notifications.show({
            color: 'red',
            title: 'Could not delete card',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        } finally {
          setLoading(false);
        }
      },
    });
  }, [card.id, onCardDeleted, onClose, setLoading]);

  return {
    handleUpdateTitle,
    handleUpdateDescription,
    handleCancelDescriptionEdit,
    onBeforeDeleteAttachment,
    handleSaveDueDate,
    handleClearDueDate,
    handleSaveStartDate,
    handleClearStartDate,
    handleSaveEndDate,
    handleClearEndDate,
    handleCopyCardLink,
    handleDeleteCard,
  };
}
