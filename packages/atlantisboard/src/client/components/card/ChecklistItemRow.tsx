import {
  Group,
  Text,
  TextInput,
  Checkbox,
  Box,
  Menu,
  ActionIcon,
} from '@mantine/core';
import { IconDots, IconPencil, IconTrash } from '@tabler/icons-react';
import type { CardDB } from '../../store/database.js';
import {
  CHECKLIST_ITEM_TEXT_MAX_LENGTH,
} from './checklistSectionConstants.js';
import type { ChecklistSectionController } from './useChecklistSection.js';

type ChecklistItem = CardDB['checklists'][number]['items'][number];

interface ChecklistItemRowProps {
  readonly checklistId: string;
  readonly item: ChecklistItem;
  readonly canEdit: boolean;
  readonly controller: ChecklistSectionController;
}

export function ChecklistItemRow({ checklistId, item, canEdit, controller }: ChecklistItemRowProps) {
  const {
    deletingItemIds,
    optimisticCompletedByItemId,
    itemRename,
    setItemRename,
    itemRenameSaving,
    itemRenameOverLimit,
    itemRenameInputRef,
    itemRenameEscapeBlurSkipRef,
    handleToggleItem,
    startInlineItemRename,
    finalizeInlineItemRename,
    handleDeleteItem,
  } = controller;

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
        onChange={() => handleToggleItem(checklistId, item.id, isCompleted)}
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
                prev && prev.itemId === item.id ? { ...prev, draft: nextDraft } : prev,
              );
            }}
            onKeyDown={(e) => {
              const value = e.currentTarget.value;
              if (e.key === 'Enter') {
                e.preventDefault();
                void finalizeInlineItemRename(checklistId, item.id, item.text, value);
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
              void finalizeInlineItemRename(checklistId, item.id, item.text, value);
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
                        startInlineItemRename(checklistId, item.id, item.text);
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
                        void handleDeleteItem(checklistId, item.id);
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
}
