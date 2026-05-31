import { Box, Group, Stack, Text, TextInput, Menu, ActionIcon } from '@mantine/core';
import { IconDots, IconPencil, IconTrash } from '@tabler/icons-react';
import type { CardDB } from '../../store/database.js';
import type { ChecklistSectionController } from './useChecklistSection.js';
import { ChecklistItemRow } from './ChecklistItemRow.js';

type Checklist = CardDB['checklists'][number];

interface ChecklistBlockProps {
  readonly checklist: Checklist;
  readonly canEdit: boolean;
  readonly controller: ChecklistSectionController;
}

export function ChecklistBlock({ checklist, canEdit, controller }: ChecklistBlockProps) {
  const {
    creatingItemChecklistId,
    addItemInputRefs,
    openRenameChecklistModal,
    openDeleteChecklistModal,
    handleCreateItem,
  } = controller;

  return (
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
        {checklist.items.map((item) => (
          <ChecklistItemRow
            key={item.id}
            checklistId={checklist.id}
            item={item}
            canEdit={canEdit}
            controller={controller}
          />
        ))}
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
  );
}
