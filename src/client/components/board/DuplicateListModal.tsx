import { useEffect, useMemo, useState } from 'react';
import { Modal, Button, Stack, Group, Text, Select, Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { KB_IOS_MODAL_HEADER_SAFE_CLASS } from '../../constants/iosModalSafeArea.js';
import { api } from '../../utils/api.js';

interface BoardOption {
  readonly id: string;
  readonly name: string;
}

interface DuplicateListModalProps {
  readonly listId: string;
  readonly listName: string;
  readonly boardId: string;
  readonly boardName: string;
  readonly workspaceId: string | undefined;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
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
  const [boards, setBoards] = useState<readonly BoardOption[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadBoards = async (): Promise<void> => {
      setLoadingBoards(true);
      try {
        if (workspaceId != null && workspaceId.trim() !== '') {
          const response = await api.getBoardsByWorkspace(workspaceId);
          const rows = (response as { boards?: Array<{ _id?: string; id?: string; name?: string }> })
            .boards ?? [];
          const options = rows
            .map((row) => {
              const id = (row._id ?? row.id ?? '').trim();
              const name = (row.name ?? '').trim() || 'Untitled board';
              return id !== '' ? { id, name } : null;
            })
            .filter((row): row is BoardOption => row != null);
          if (!cancelled) {
            setBoards(options);
          }
        } else if (!cancelled) {
          setBoards([{ id: boardId, name: boardName }]);
        }
      } catch {
        if (!cancelled) {
          setBoards([{ id: boardId, name: boardName }]);
        }
      } finally {
        if (!cancelled) {
          setLoadingBoards(false);
        }
      }
    };
    void loadBoards();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, boardId, boardName]);

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
      await api.duplicateList(listId, targetBoardId);
      onSuccess();
      onClose();
      notifications.show({
        color: 'green',
        title: 'List duplicated',
        message: `"${listName}" was duplicated.`,
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Could not duplicate list',
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
              disabled={loading || loadingBoards || targetBoardId.trim() === ''}
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
