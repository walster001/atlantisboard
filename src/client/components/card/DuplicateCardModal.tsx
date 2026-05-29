import { useState } from 'react';
import { Modal, Button, Stack, Group } from '@mantine/core';
import { KB_IOS_MODAL_HEADER_SAFE_CLASS } from '../../constants/iosModalSafeArea.js';
import { api } from '../../utils/api.js';
import { applyDuplicateCardToRuntime } from '../../utils/applyDuplicationToRuntime.js';
import { runDuplicationWithProgressNotification } from '../../utils/duplicationProgressNotifications.js';
import { DuplicateTargetBoardListPicker } from '../board/DuplicateTargetBoardListPicker.js';

interface DuplicateCardModalProps {
  readonly cardId: string;
  readonly currentListId: string;
  readonly boardId: string;
  readonly boardName: string;
  readonly workspaceId: string | undefined;
  readonly onClose: () => void;
  readonly onSuccess: (appliedToCurrentBoard: boolean) => void;
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
      const result = await runDuplicationWithProgressNotification({
        kind: 'card',
        label: 'Copying card and attachments…',
        task: () => api.duplicateCard(cardId, targetListId),
        successMessage: 'The card was copied to the selected list.',
      });
      const applied =
        targetBoardId === boardId && applyDuplicateCardToRuntime(boardId, result.card) != null;
      onSuccess(applied);
      onClose();
    } catch {
      /* notification shown */
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
              Duplicate card
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
