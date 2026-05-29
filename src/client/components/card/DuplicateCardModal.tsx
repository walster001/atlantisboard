import { useState } from 'react';
import { Modal, Button, Stack, Group } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { KB_IOS_MODAL_HEADER_SAFE_CLASS } from '../../constants/iosModalSafeArea.js';
import { api } from '../../utils/api.js';
import { DuplicateTargetBoardListPicker } from '../board/DuplicateTargetBoardListPicker.js';

interface DuplicateCardModalProps {
  readonly cardId: string;
  readonly currentListId: string;
  readonly boardId: string;
  readonly boardName: string;
  readonly workspaceId: string | undefined;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
}

export function DuplicateCardModal({
  cardId,
  currentListId,
  boardId,
  boardName,
  workspaceId,
  onClose,
  onSuccess,
}: DuplicateCardModalProps): React.ReactElement {
  const [targetBoardId, setTargetBoardId] = useState(boardId);
  const [targetListId, setTargetListId] = useState(currentListId);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (targetListId.trim() === '') {
      return;
    }

    setLoading(true);
    try {
      await api.duplicateCard(cardId, targetListId);
      onSuccess();
      onClose();
      notifications.show({
        color: 'green',
        title: 'Card duplicated',
        message: 'The card was copied to the selected list.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Could not duplicate card',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title="Duplicate card"
      centered
      classNames={{ header: KB_IOS_MODAL_HEADER_SAFE_CLASS }}
    >
      <form onSubmit={(e) => void handleSubmit(e)}>
        <Stack gap="md">
          <DuplicateTargetBoardListPicker
            workspaceId={workspaceId}
            currentBoardId={boardId}
            currentBoardName={boardName}
            currentListId={currentListId}
            targetBoardId={targetBoardId}
            onTargetBoardIdChange={setTargetBoardId}
            targetListId={targetListId}
            onTargetListIdChange={setTargetListId}
            disabled={loading}
            listDescription="The card will be duplicated with labels, checklists, comments, assignees, and due dates."
          />

          <Group justify="flex-end" mt="md">
            <Button type="button" variant="subtle" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              color="blue"
              disabled={loading || targetListId.trim() === ''}
              loading={loading}
            >
              {loading ? 'Duplicating…' : 'Duplicate card'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
