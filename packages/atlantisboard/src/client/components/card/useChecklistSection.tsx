import { useEffect, useMemo, useRef, useState } from 'react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { Text } from '@mantine/core';
import type { CardDB } from '../../store/database.js';
import { api } from '../../utils/api.js';
import { normalizeCardFromApi } from '../../utils/transform.js';
import {
  CHECKLIST_ITEM_TEXT_MAX_LENGTH,
  CHECKLIST_TITLE_MAX_LENGTH,
  findChecklistItemCompleted,
} from './checklistSectionConstants.js';

interface UseChecklistSectionOptions {
  readonly card: CardDB;
  readonly canEdit: boolean;
  readonly onCardUpdate: (card: CardDB) => void;
}

export function useChecklistSection({ card, canEdit, onCardUpdate }: UseChecklistSectionOptions) {
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [showNewChecklist, setShowNewChecklist] = useState(false);
  const [isCreatingChecklist, setIsCreatingChecklist] = useState(false);
  const [creatingItemChecklistId, setCreatingItemChecklistId] = useState<string | null>(null);
  const checklistItemToggleInFlightRef = useRef<Set<string>>(new Set());
  const [deletingItemIds, setDeletingItemIds] = useState<Set<string>>(new Set());
  const [optimisticCompletedByItemId, setOptimisticCompletedByItemId] = useState<Map<string, boolean>>(
    new Map(),
  );

  const checklistCompletionSignature = useMemo(
    () =>
      card.checklists
        .flatMap((cl) => cl.items.map((it) => `${it.id}:${it.completed ? 1 : 0}`))
        .sort((a, b) => a.localeCompare(b))
        .join('|'),
    [card.checklists],
  );

  useEffect(() => {
    setOptimisticCompletedByItemId((prev) => {
      if (prev.size === 0) {
        return prev;
      }
      const next = new Map(prev);
      for (const [itemId, optimisticVal] of prev) {
        const actual = findChecklistItemCompleted(card, itemId);
        if (actual === undefined || actual === optimisticVal) {
          next.delete(itemId);
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [checklistCompletionSignature, card]);

  const [checklistRename, setChecklistRename] = useState<{ checklistId: string; draft: string } | null>(
    null,
  );
  const [checklistRenameSaving, setChecklistRenameSaving] = useState(false);

  const [itemRename, setItemRename] = useState<{
    checklistId: string;
    itemId: string;
    draft: string;
  } | null>(null);
  const [itemRenameSaving, setItemRenameSaving] = useState(false);

  const addItemInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const [pendingFocusAddItemChecklistId, setPendingFocusAddItemChecklistId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const id = pendingFocusAddItemChecklistId;
    if (id == null) {
      return;
    }
    if (!card.checklists.some((c) => c.id === id)) {
      return;
    }
    setPendingFocusAddItemChecklistId(null);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        addItemInputRefs.current.get(id)?.focus();
      });
    });
  }, [card.checklists, pendingFocusAddItemChecklistId]);

  const focusAddItemInput = (checklistId: string): void => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        addItemInputRefs.current.get(checklistId)?.focus();
      });
    });
  };

  const handleCreateChecklist = async () => {
    if (!canEdit) {
      return;
    }
    if (!newChecklistTitle.trim()) return;

    const prevChecklistIds = new Set(card.checklists.map((c) => c.id));
    setIsCreatingChecklist(true);
    try {
      const response = await api.createChecklist({
        cardId: card.id,
        title: newChecklistTitle.trim(),
      });
      const updatedCard = normalizeCardFromApi(response.card, card.id);
      onCardUpdate(updatedCard);
      setNewChecklistTitle('');
      setShowNewChecklist(false);
      const created = updatedCard.checklists.find((c) => !prevChecklistIds.has(c.id));
      if (created != null) {
        setPendingFocusAddItemChecklistId(created.id);
      }
    } catch (error) {
      console.error('Error creating checklist:', error);
    } finally {
      setIsCreatingChecklist(false);
    }
  };

  const handleCreateItem = async (checklistId: string, text: string) => {
    if (!canEdit) {
      return;
    }
    if (!text.trim()) return;

    setCreatingItemChecklistId(checklistId);
    try {
      const response = await api.createChecklistItem({
        cardId: card.id,
        checklistId,
        text: text.trim(),
      });
      const updatedCard = normalizeCardFromApi(response.card, card.id);
      onCardUpdate(updatedCard);
      focusAddItemInput(checklistId);
    } catch (error) {
      console.error('Error creating checklist item:', error);
    } finally {
      setCreatingItemChecklistId((prev) => (prev === checklistId ? null : prev));
    }
  };

  const handleToggleItem = async (checklistId: string, itemId: string, completed: boolean) => {
    if (!canEdit) {
      return;
    }
    if (checklistItemToggleInFlightRef.current.has(itemId)) {
      return;
    }
    if (deletingItemIds.has(itemId)) {
      return;
    }
    if (itemRename?.itemId === itemId) {
      return;
    }
    checklistItemToggleInFlightRef.current.add(itemId);
    const nextCompleted = !completed;
    setOptimisticCompletedByItemId((prev) => {
      const next = new Map(prev);
      next.set(itemId, nextCompleted);
      return next;
    });
    try {
      const response = await api.updateChecklistItem(itemId, {
        cardId: card.id,
        checklistId,
        completed: !completed,
      });
      const updatedCard = normalizeCardFromApi(response.card, card.id);
      onCardUpdate(updatedCard);
    } catch (error) {
      console.error('Error updating checklist item:', error);
      setOptimisticCompletedByItemId((prev) => {
        const next = new Map(prev);
        next.delete(itemId);
        return next;
      });
    } finally {
      checklistItemToggleInFlightRef.current.delete(itemId);
    }
  };

  const handleOpenAddChecklist = () => {
    setNewChecklistTitle('');
    setShowNewChecklist(true);
  };

  const openRenameChecklistModal = (checklistId: string, currentTitle: string) => {
    setChecklistRename({ checklistId, draft: currentTitle });
  };

  const commitRenameChecklist = async () => {
    if (!checklistRename) return;
    const trimmed = checklistRename.draft.trim();
    if (trimmed.length === 0 || trimmed.length > CHECKLIST_TITLE_MAX_LENGTH) {
      return;
    }
    setChecklistRenameSaving(true);
    try {
      const response = await api.updateChecklist(checklistRename.checklistId, {
        cardId: card.id,
        title: trimmed,
      });
      const updatedCard = normalizeCardFromApi(response.card, card.id);
      onCardUpdate(updatedCard);
      setChecklistRename(null);
    } catch (error) {
      console.error('Error renaming checklist:', error);
      notifications.show({
        color: 'red',
        title: 'Could not rename checklist',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setChecklistRenameSaving(false);
    }
  };

  const openDeleteChecklistModal = (checklistId: string, checklistTitle: string) => {
    modals.openConfirmModal({
      title: 'Delete checklist?',
      centered: true,
      children: (
        <Text size="sm">
          Delete &quot;{checklistTitle}&quot; and all of its items? This cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete checklist', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api.deleteChecklist(checklistId, card.id);
          const response = await api.getCard(card.id);
          const updatedCard = normalizeCardFromApi(response.card, card.id);
          onCardUpdate(updatedCard);
        } catch (error) {
          console.error('Error deleting checklist:', error);
          notifications.show({
            color: 'red',
            title: 'Could not delete checklist',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
    });
  };

  const startInlineItemRename = (checklistId: string, itemId: string, currentText: string) => {
    setItemRename({ checklistId, itemId, draft: currentText });
  };

  const finalizeInlineItemRename = async (
    checklistId: string,
    itemId: string,
    originalText: string,
    draft: string,
  ) => {
    if (itemRenameSaving) {
      return;
    }
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      setItemRename(null);
      return;
    }
    if (trimmed.length > CHECKLIST_ITEM_TEXT_MAX_LENGTH) {
      return;
    }
    if (trimmed === originalText.trim()) {
      setItemRename(null);
      return;
    }
    setItemRenameSaving(true);
    try {
      const response = await api.updateChecklistItem(itemId, {
        cardId: card.id,
        checklistId,
        text: trimmed,
      });
      const updatedCard = normalizeCardFromApi(response.card, card.id);
      onCardUpdate(updatedCard);
      setItemRename(null);
    } catch (error) {
      console.error('Error renaming checklist item:', error);
      notifications.show({
        color: 'red',
        title: 'Could not rename item',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setItemRenameSaving(false);
    }
  };

  const handleDeleteItem = async (checklistId: string, itemId: string) => {
    if (!canEdit) {
      return;
    }
    setDeletingItemIds((prev) => {
      const next = new Set(prev);
      next.add(itemId);
      return next;
    });
    try {
      await api.deleteChecklistItem(itemId, {
        cardId: card.id,
        checklistId,
      });
      const response = await api.getCard(card.id);
      const updatedCard = normalizeCardFromApi(response.card, card.id);
      onCardUpdate(updatedCard);
    } catch (error) {
      console.error('Error deleting checklist item:', error);
      notifications.show({
        color: 'red',
        title: 'Could not delete item',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setDeletingItemIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const checklistRenameOverLimit = (checklistRename?.draft.length ?? 0) > CHECKLIST_TITLE_MAX_LENGTH;
  const checklistRenameDisabled =
    checklistRenameSaving ||
    checklistRenameOverLimit ||
    (checklistRename?.draft.trim().length ?? 0) === 0;

  const itemRenameOverLimit = (itemRename?.draft.length ?? 0) > CHECKLIST_ITEM_TEXT_MAX_LENGTH;

  const itemRenameInputRef = useRef<HTMLInputElement>(null);
  const itemRenameEscapeBlurSkipRef = useRef(false);

  useEffect(() => {
    if (itemRename) {
      queueMicrotask(() => {
        const el = itemRenameInputRef.current;
        if (el) {
          el.focus();
          el.select();
        }
      });
    }
  }, [itemRename]);

  return {
    newChecklistTitle,
    setNewChecklistTitle,
    showNewChecklist,
    setShowNewChecklist,
    isCreatingChecklist,
    creatingItemChecklistId,
    deletingItemIds,
    optimisticCompletedByItemId,
    checklistRename,
    setChecklistRename,
    checklistRenameSaving,
    itemRename,
    setItemRename,
    itemRenameSaving,
    addItemInputRefs,
    checklistRenameOverLimit,
    checklistRenameDisabled,
    itemRenameOverLimit,
    itemRenameInputRef,
    itemRenameEscapeBlurSkipRef,
    handleCreateChecklist,
    handleCreateItem,
    handleToggleItem,
    handleOpenAddChecklist,
    openRenameChecklistModal,
    commitRenameChecklist,
    openDeleteChecklistModal,
    startInlineItemRename,
    finalizeInlineItemRename,
    handleDeleteItem,
  };
}

export type ChecklistSectionController = ReturnType<typeof useChecklistSection>;
