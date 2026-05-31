import { useEffect, useMemo, useState } from 'react';
import { Modal, Button, Stack, Group, Text, Select, Loader } from '@mantine/core';
import { KB_IOS_MODAL_HEADER_SAFE_CLASS } from '../../constants/iosModalSafeArea.js';
import { api } from '../../utils/api.js';
import { useDuplicateTargetBoardOptions } from '../../hooks/useDuplicateTargetBoardOptions.js';
import {
  applyDuplicateListToRuntime,
  type DuplicateListApplyPayload,
} from '../../utils/applyDuplicationToRuntime.js';
import { runDuplicationWithProgressNotification } from '../../utils/duplicationProgressNotifications.js';

interface DuplicateListModalProps {
  readonly listId: string;
  readonly listName: string;
  readonly boardId: string;
  readonly boardName: string;
  readonly workspaceId: string | undefined;
  readonly onClose: () => void;
  readonly onSuccess: (payload: DuplicateListApplyPayload) => void;
}

export function DuplicateListModal({
  listId,
  listName,
  boardId,
  boardName,
  workspaceId,
  onClose,
  onSuccess,
}: DuplicateListModalProps): React.ReactElement {
  const [targetBoardId, setTargetBoardId] = useState(boardId);
  const { boards, loading: loadingBoards } = useDuplicateTargetBoardOptions({
    workspaceId,
    currentBoardId: boardId,
    currentBoardName: boardName,
    kind: 'list',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (loadingBoards || boards.length === 0) {
      return;
    }
    if (!boards.some((board) => board.id === targetBoardId)) {
      const preferred =
        boards.find((board) => board.id === boardId)?.id ?? boards[0]?.id ?? boardId;
      setTargetBoardId(preferred);
    }
  }, [boards, loadingBoards, targetBoardId, boardId]);

  const boardSelectData = useMemo(
    () => boards.map((board) => ({ value: board.id, label: board.name })),
    [boards],
  );

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (targetBoardId.trim() === '') {
      return;
    }
    setLoading(true);
    try {
      const result = await runDuplicationWithProgressNotification({
        kind: 'list',
        label: `Copying "${listName}" and its cards…`,
        task: () => api.duplicateList(listId, targetBoardId),
        successMessage: `"${listName}" was duplicated.`,
      });
      const payload: DuplicateListApplyPayload = {
        list: result.list,
        cards: result.cards ?? [],
        targetBoardId,
      };
      applyDuplicateListToRuntime(boardId, payload);
      onSuccess(payload);
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
      title="Duplicate list"
      centered
      classNames={{ header: KB_IOS_MODAL_HEADER_SAFE_CLASS }}
    >
      <form onSubmit={(e) => void handleSubmit(e)}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Duplicates this list and all of its cards. Choose the board where the copy should appear.
          </Text>
          {loadingBoards ? (
            <Loader size="sm" />
          ) : boardSelectData.length === 0 ? (
            <Text size="sm" c="dimmed">
              No boards in this workspace allow creating lists.
            </Text>
          ) : (
            <Select
              label="Target board"
              value={targetBoardId}
              onChange={(value) => setTargetBoardId(value ?? boardId)}
              data={boardSelectData}
              required
              disabled={loading || boardSelectData.length <= 1}
              searchable={boardSelectData.length > 8}
              allowDeselect={false}
            />
          )}
          <Group justify="flex-end" mt="md">
            <Button type="button" variant="subtle" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              color="blue"
              disabled={loading || loadingBoards || targetBoardId.trim() === '' || boardSelectData.length === 0}
              loading={loading}
            >
              Duplicate list
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
