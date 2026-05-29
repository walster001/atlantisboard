import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Stack,
  Text,
  TextInput,
  Button,
  Checkbox,
  Group,
  Box,
  Menu,
  ActionIcon,
  Modal,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconDots, IconListCheck, IconPencil, IconTrash } from '@tabler/icons-react';
import type { CardDB } from '../../store/database.js';
import { api } from '../../utils/api.js';
import { normalizeCardFromApi } from '../../utils/transform.js';
import {
  CARD_DETAIL_SECTION_ICON_COLOR,
  cardDetailEmptyStateProps,
  cardDetailSectionTitleProps,
  cardDetailSoftButtonStyles,
} from './cardDetailSectionUi.js';
import './checklistSection.css';

const CHECKLIST_TITLE_MAX_LENGTH = 100;
const CHECKLIST_ITEM_TEXT_MAX_LENGTH = 500;

function findChecklistItemCompleted(card: CardDB, itemId: string): boolean | undefined {
  for (const cl of card.checklists) {
    for (const it of cl.items) {
      if (it.id === itemId) {
        return it.completed;
      }
    }
  }
  return undefined;
}

interface ChecklistSectionProps {
  card: CardDB;
  canEdit?: boolean;
  onCardUpdate: (card: CardDB) => void;
}

export function ChecklistSection({ card, canEdit = true, onCardUpdate }: ChecklistSectionProps) {
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

  /** "Add an item" field per checklist — focus after checklist creation or after adding an item. */
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
      const updatedCard = normalizeCardFromApi((response as { card: unknown }).card, card.id);
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
      const updatedCard = normalizeCardFromApi((response as { card: unknown }).card, card.id);
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
      const updatedCard = normalizeCardFromApi((response as { card: unknown }).card, card.id);
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
      const updatedCard = normalizeCardFromApi((response as { card: unknown }).card, card.id);
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
          const updatedCard = normalizeCardFromApi((response as { card: unknown }).card, card.id);
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
      const updatedCard = normalizeCardFromApi((response as { card: unknown }).card, card.id);
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
      const updatedCard = normalizeCardFromApi((response as { card: unknown }).card, card.id);
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

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <IconListCheck size={18} stroke={1.5} color={CARD_DETAIL_SECTION_ICON_COLOR} aria-hidden />
          <Text {...cardDetailSectionTitleProps}>Checklist</Text>
        </Group>
        {canEdit ? (
        <Button
          size="sm"
          variant="default"
          styles={cardDetailSoftButtonStyles}
          onClick={handleOpenAddChecklist}
          disabled={isCreatingChecklist}
        >
          + Add Item
        </Button>
        ) : null}
      </Group>

      {card.checklists.length === 0 && !showNewChecklist ? (
        <Text {...cardDetailEmptyStateProps}>
          No checklist items yet. Click Add Item to create one.
        </Text>
      ) : null}

      {card.checklists.map((checklist) => (
        <Box
          key={checklist.id}
          className="checklist-block"
          p="md"
          style={{
            border: '1px solid var(--mantine-color-gray-3)',
            borderRadius: 'var(--mantine-radius-md)',
          }}
        >
          <div className="checklist-block__header">
            <Text fw={500} className="checklist-block__title">
              {checklist.title}
            </Text>
            {canEdit ? (
            <Box
              className="checklist-block__menu"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <Menu position="bottom-end" width={220} closeOnClickOutside>
                <Menu.Target>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    c="dimmed"
                    aria-label="Checklist actions"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <IconDots size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconPencil size={16} />}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openRenameChecklistModal(checklist.id, checklist.title);
                    }}
                  >
                    Rename checklist
                  </Menu.Item>
                  <Menu.Item
                    color="red"
                    leftSection={<IconTrash size={16} />}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openDeleteChecklistModal(checklist.id, checklist.title);
                    }}
                  >
                    Delete checklist
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Box>
            ) : null}
          </div>
          <Stack gap="xs">
            {checklist.items.map((item) => {
              const isCompleted = optimisticCompletedByItemId.get(item.id) ?? item.completed;
              const isEditingItem = itemRename?.itemId === item.id;
              return (
                <Group
                  key={item.id}
                  className="checklist-item-row"
                  wrap="nowrap"
                  align="flex-start"
                  gap="xs"
                >
                  <Checkbox
                    checked={isCompleted}
                    onChange={() => handleToggleItem(checklist.id, item.id, isCompleted)}
                    disabled={!canEdit || deletingItemIds.has(item.id) || isEditingItem}
                    style={{ flexShrink: 0 }}
                  />
                  <Box
                    style={{
                      display: 'flex',
                      flex: 1,
                      minWidth: 0,
                      alignItems: 'flex-start',
                      gap: 'var(--mantine-spacing-xs)',
                    }}
                  >
                    {isEditingItem && itemRename ? (
                      <TextInput
                        ref={itemRenameInputRef}
                        variant="unstyled"
                        size="sm"
                        value={itemRename.draft}
                        onChange={(e) => {
                          const nextDraft = e.currentTarget.value;
                          setItemRename((prev) =>
                            prev && prev.itemId === item.id
                              ? { ...prev, draft: nextDraft }
                              : prev,
                          );
                        }}
                        onKeyDown={(e) => {
                          const value = e.currentTarget.value;
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void finalizeInlineItemRename(
                              checklist.id,
                              item.id,
                              item.text,
                              value,
                            );
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            itemRenameEscapeBlurSkipRef.current = true;
                            setItemRename(null);
                          }
                        }}
                        onBlur={(e) => {
                          const value = e.currentTarget.value;
                          if (itemRenameEscapeBlurSkipRef.current) {
                            itemRenameEscapeBlurSkipRef.current = false;
                            return;
                          }
                          void finalizeInlineItemRename(
                            checklist.id,
                            item.id,
                            item.text,
                            value,
                          );
                        }}
                        disabled={itemRenameSaving}
                        maxLength={CHECKLIST_ITEM_TEXT_MAX_LENGTH}
                        error={
                          isEditingItem && itemRenameOverLimit
                            ? `Maximum ${CHECKLIST_ITEM_TEXT_MAX_LENGTH} characters`
                            : undefined
                        }
                        styles={{
                          root: { flex: 1, minWidth: 0 },
                          input: {
                            padding: 0,
                            minHeight: 0,
                            lineHeight: 1.5,
                            fontWeight: 400,
                          },
                        }}
                        aria-label="Edit checklist item"
                      />
                    ) : (
                      <>
                        <Text
                          component="span"
                          style={{
                            flex: '0 1 auto',
                            minWidth: 0,
                            wordBreak: 'break-word',
                            textDecoration: isCompleted ? 'line-through' : undefined,
                            opacity: isCompleted ? 0.6 : 1,
                          }}
                        >
                          {item.text}
                        </Text>
                        {canEdit ? (
                        <Box
                          className="checklist-item-row__menu"
                          style={{ flexShrink: 0 }}
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <Menu position="bottom-end" width={200} closeOnClickOutside>
                            <Menu.Target>
                              <ActionIcon
                                variant="subtle"
                                size="sm"
                                c="dimmed"
                                aria-label="Checklist item actions"
                                disabled={deletingItemIds.has(item.id)}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                              >
                                <IconDots size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item
                                leftSection={<IconPencil size={16} />}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  startInlineItemRename(checklist.id, item.id, item.text);
                                }}
                              >
                                Rename item
                              </Menu.Item>
                              <Menu.Item
                                color="red"
                                leftSection={<IconTrash size={16} />}
                                disabled={deletingItemIds.has(item.id)}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void handleDeleteItem(checklist.id, item.id);
                                }}
                              >
                                Delete item
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Box>
                        ) : null}
                      </>
                    )}
                  </Box>
                </Group>
              );
            })}
            {canEdit ? (
            <Group gap="xs" mt="xs">
              <TextInput
                ref={(node) => {
                  if (node != null) {
                    addItemInputRefs.current.set(checklist.id, node);
                  } else {
                    addItemInputRefs.current.delete(checklist.id);
                  }
                }}
                size="sm"
                placeholder="Add an item"
                style={{ flex: 1 }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const value = e.currentTarget.value;
                    e.currentTarget.value = '';
                    void handleCreateItem(checklist.id, value);
                  }
                }}
                disabled={creatingItemChecklistId === checklist.id}
              />
            </Group>
            ) : null}
          </Stack>
        </Box>
      ))}

      {showNewChecklist && canEdit ? (
        <Box
          p="md"
          style={{
            border: '1px solid var(--mantine-color-gray-3)',
            borderRadius: 'var(--mantine-radius-md)',
          }}
        >
          <TextInput
            placeholder="Checklist title"
            value={newChecklistTitle}
            onChange={(e) => setNewChecklistTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateChecklist();
              }
              if (e.key === 'Escape') {
                setShowNewChecklist(false);
                setNewChecklistTitle('');
              }
            }}
            autoFocus
            disabled={isCreatingChecklist}
            mb="sm"
            maxLength={CHECKLIST_TITLE_MAX_LENGTH}
          />
          <Group gap="xs">
            <Button
              size="sm"
              color="blue"
              onClick={handleCreateChecklist}
              disabled={isCreatingChecklist || !newChecklistTitle.trim()}
            >
              Add
            </Button>
            <Button
              size="sm"
              variant="subtle"
              onClick={() => {
                setShowNewChecklist(false);
                setNewChecklistTitle('');
              }}
              disabled={isCreatingChecklist}
            >
              Cancel
            </Button>
          </Group>
        </Box>
      ) : null}

      <Modal
        opened={canEdit && checklistRename !== null}
        onClose={() => setChecklistRename(null)}
        title="Rename checklist"
        centered
      >
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <Stack gap="md">
            <TextInput
              label="Title"
              value={checklistRename?.draft ?? ''}
              onChange={(e) => {
                const nextDraft = e.currentTarget.value;
                setChecklistRename((prev) =>
                  prev ? { ...prev, draft: nextDraft } : prev,
                );
              }}
              maxLength={CHECKLIST_TITLE_MAX_LENGTH}
              error={
                checklistRenameOverLimit
                  ? `Maximum ${CHECKLIST_TITLE_MAX_LENGTH} characters`
                  : undefined
              }
              autoFocus
            />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setChecklistRename(null)}>
                Cancel
              </Button>
              <Button
                color="blue"
                onClick={() => void commitRenameChecklist()}
                loading={checklistRenameSaving}
                disabled={checklistRenameDisabled}
              >
                Save
              </Button>
            </Group>
          </Stack>
        </div>
      </Modal>
    </Stack>
  );
}
