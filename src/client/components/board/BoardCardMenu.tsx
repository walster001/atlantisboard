import { useState, type FormEvent } from 'react';
import {
  Menu,
  ActionIcon,
  Modal,
  TextInput,
  Textarea,
  Button,
  Stack,
  Group,
  Text,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconDots,
  IconPencil,
  IconTrash,
  IconFileDescription,
  IconPalette,
} from '@tabler/icons-react';
import { BOARD_DESCRIPTION_MAX_LENGTH, BOARD_NAME_MAX_LENGTH } from '../../constants/boardFieldLimits.js';
import { BoardColourPickerPanel } from './BoardColourPickerPanel.js';
import {
  BOARD_PRESET_COLOURS,
  normalizePresetHex,
} from '../../constants/boardPresetColors.js';
import { api } from '../../utils/api.js';

interface BoardCardMenuProps {
  boardId: string;
  boardName: string;
  boardDescription: string;
  boardBackground?: string;
  menuIconColor?: string;
  onBoardUpdated: () => void | Promise<void>;
  onBoardDeleted: () => void | Promise<void>;
}

export function BoardCardMenu({
  boardId,
  boardName,
  boardDescription,
  boardBackground = '',
  menuIconColor = '#ffffff',
  onBoardUpdated,
  onBoardDeleted,
}: BoardCardMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [descSaving, setDescSaving] = useState(false);
  const [coverColourOpen, setCoverColourOpen] = useState(false);
  const [coverColourSaving, setCoverColourSaving] = useState(false);
  const [coverColourDraft, setCoverColourDraft] = useState<string>(() =>
    normalizePresetHex('#3b82f6', BOARD_PRESET_COLOURS),
  );
  const [coverUseThemeDefault, setCoverUseThemeDefault] = useState(true);

  const renameOverLimit = renameDraft.length > BOARD_NAME_MAX_LENGTH;
  const descOverLimit = descDraft.length > BOARD_DESCRIPTION_MAX_LENGTH;
  const renameDisabled =
    renameSaving || renameOverLimit || renameDraft.trim().length === 0;

  const openRenameModal = () => {
    setIsOpen(false);
    setRenameDraft(boardName);
    setRenameOpen(true);
  };

  const openDescModal = () => {
    setIsOpen(false);
    setDescDraft(boardDescription);
    setDescOpen(true);
  };

  const openCoverColourModal = () => {
    setIsOpen(false);
    const trimmed = boardBackground.trim();
    const isHex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed);
    setCoverUseThemeDefault(!isHex);
    setCoverColourDraft(
      normalizePresetHex(isHex ? trimmed : '#3b82f6', BOARD_PRESET_COLOURS),
    );
    setCoverColourOpen(true);
  };

  const commitRename = async () => {
    if (renameDisabled) {
      return;
    }
    setRenameSaving(true);
    try {
      await api.updateBoard(boardId, { name: renameDraft.trim() });
      await onBoardUpdated();
      setRenameOpen(false);
      notifications.show({
        title: 'Board renamed',
        message: 'The board name has been updated.',
        color: 'green',
      });
    } catch (error) {
      console.error('Error renaming board:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to rename board.',
        color: 'red',
      });
    } finally {
      setRenameSaving(false);
    }
  };

  const handleRenameFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void commitRename();
  };

  const commitDescription = async () => {
    if (descOverLimit || descSaving) {
      return;
    }
    setDescSaving(true);
    try {
      await api.updateBoard(boardId, { description: descDraft.trim() });
      await onBoardUpdated();
      setDescOpen(false);
      notifications.show({
        title: 'Description updated',
        message: 'The board description has been saved.',
        color: 'green',
      });
    } catch (error) {
      console.error('Error updating description:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to update description.',
        color: 'red',
      });
    } finally {
      setDescSaving(false);
    }
  };

  const handleDescSubmit = (e: FormEvent) => {
    e.preventDefault();
    void commitDescription();
  };

  const commitCoverColour = async (): Promise<void> => {
    if (coverColourSaving) {
      return;
    }
    setCoverColourSaving(true);
    try {
      await api.updateBoard(boardId, {
        background: coverUseThemeDefault ? '' : coverColourDraft.trim(),
      });
      await onBoardUpdated();
      setCoverColourOpen(false);
      notifications.show({
        title: 'Cover colour updated',
        message: coverUseThemeDefault
          ? 'Board cover reset to default theme colour.'
          : 'Board cover colour has been updated.',
        color: 'green',
      });
    } catch (error) {
      console.error('Error updating board cover colour:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to update board cover colour.',
        color: 'red',
      });
    } finally {
      setCoverColourSaving(false);
    }
  };

  const openDeleteBoardModal = () => {
    setIsOpen(false);
    modals.openConfirmModal({
      title: 'Delete board?',
      centered: true,
      children: (
        <Text size="sm">
          This will permanently delete the board and all its cards. This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete board', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api.deleteBoard(boardId);
          onBoardDeleted();
          notifications.show({
            title: 'Board deleted',
            message: 'The board has been permanently deleted.',
            color: 'green',
          });
        } catch (error) {
          console.error('Error deleting board:', error);
          notifications.show({
            title: 'Error',
            message: 'Failed to delete board.',
            color: 'red',
          });
        }
      },
    });
  };

  return (
    <>
      <Menu opened={isOpen} onChange={setIsOpen} position="bottom-end" width={220} closeOnClickOutside>
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            size="sm"
            style={{ color: menuIconColor }}
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
              openRenameModal();
            }}
          >
            Rename board
          </Menu.Item>
          <Menu.Item
            leftSection={<IconFileDescription size={16} />}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openDescModal();
            }}
          >
            Edit board description
          </Menu.Item>
          <Menu.Item
            leftSection={<IconPalette size={16} />}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openCoverColourModal();
            }}
          >
            Cover colour
          </Menu.Item>
          <Menu.Item
            color="red"
            leftSection={<IconTrash size={16} />}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openDeleteBoardModal();
            }}
          >
            Delete board
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <Modal
        opened={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Rename board"
        centered
      >
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <form onSubmit={handleRenameFormSubmit}>
            <Stack gap="md">
              <TextInput
                label="Board name"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.currentTarget.value)}
                disabled={renameSaving}
                autoFocus
                required
                error={renameOverLimit ? `Cannot exceed ${BOARD_NAME_MAX_LENGTH} characters` : undefined}
                description={
                  <Text component="span" size="xs" c={renameOverLimit ? 'red' : 'dimmed'}>
                    {renameDraft.length}/{BOARD_NAME_MAX_LENGTH}
                    {renameOverLimit ? ' — over limit' : ''}
                  </Text>
                }
              />
              <Group justify="flex-end" gap="xs">
                <Button variant="subtle" type="button" onClick={() => setRenameOpen(false)} disabled={renameSaving}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  loading={renameSaving}
                  disabled={renameDisabled}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void commitRename();
                  }}
                >
                  Rename
                </Button>
              </Group>
            </Stack>
          </form>
        </div>
      </Modal>

      <Modal
        opened={descOpen}
        onClose={() => setDescOpen(false)}
        title="Edit board description"
        centered
      >
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <form onSubmit={handleDescSubmit}>
            <Stack gap="md">
              <Textarea
                label="Description"
                placeholder="Optional description for this board"
                value={descDraft}
                onChange={(e) => setDescDraft(e.currentTarget.value)}
                disabled={descSaving}
                autoFocus
                rows={4}
                error={descOverLimit ? `Cannot exceed ${BOARD_DESCRIPTION_MAX_LENGTH} characters` : undefined}
                description={
                  <Text component="span" size="xs" c={descOverLimit ? 'red' : 'dimmed'}>
                    {descDraft.length}/{BOARD_DESCRIPTION_MAX_LENGTH}
                    {descOverLimit ? ' — over limit' : ''}
                  </Text>
                }
              />
              <Group justify="flex-end" gap="xs">
                <Button variant="subtle" type="button" onClick={() => setDescOpen(false)} disabled={descSaving}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  loading={descSaving}
                  disabled={descOverLimit || descSaving}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void commitDescription();
                  }}
                >
                  Save
                </Button>
              </Group>
            </Stack>
          </form>
        </div>
      </Modal>

      <Modal
        opened={coverColourOpen}
        onClose={() => setCoverColourOpen(false)}
        title="Cover colour"
        centered
        size="lg"
      >
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <Stack gap="md">
            <BoardColourPickerPanel
              value={coverColourDraft}
              onChange={(hex) => {
                setCoverColourDraft(hex);
                setCoverUseThemeDefault(false);
              }}
              onClearColor={() => setCoverUseThemeDefault(true)}
              noColorSelected={coverUseThemeDefault}
              disabled={coverColourSaving}
            />
            <Group justify="flex-end" gap="xs">
              <Button
                variant="subtle"
                type="button"
                onClick={() => setCoverColourOpen(false)}
                disabled={coverColourSaving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                loading={coverColourSaving}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void commitCoverColour();
                }}
              >
                Save
              </Button>
            </Group>
          </Stack>
        </div>
      </Modal>
    </>
  );
}
