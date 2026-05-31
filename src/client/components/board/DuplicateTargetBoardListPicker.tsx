import { useEffect, useMemo, useState } from 'react';
import { Loader, Select, Stack } from '@mantine/core';
import { api } from '../../utils/api.js';
import { mapBoardSummariesToOptions } from '../../utils/api/boardApiMethods.js';
import { mapListSummariesToOptions } from '../../utils/api/listApiMethods.js';

interface BoardOption {
  readonly id: string;
  readonly name: string;
}

interface ListOption {
  readonly id: string;
  readonly name: string;
}

export interface DuplicateTargetBoardListPickerProps {
  readonly workspaceId: string | undefined;
  readonly currentBoardId: string;
  readonly currentBoardName: string;
  readonly currentListId: string;
  readonly targetBoardId: string;
  readonly onTargetBoardIdChange: (boardId: string) => void;
  readonly targetListId: string;
  readonly onTargetListIdChange: (listId: string) => void;
  readonly disabled?: boolean;
  readonly listLabel?: string;
  readonly listDescription?: string;
}

export function DuplicateTargetBoardListPicker({
  workspaceId,
  currentBoardId,
  currentBoardName,
  currentListId,
  targetBoardId,
  onTargetBoardIdChange,
  targetListId,
  onTargetListIdChange,
  disabled = false,
  listLabel = 'Target list',
  listDescription,
}: DuplicateTargetBoardListPickerProps): React.ReactElement {
  const [boards, setBoards] = useState<readonly BoardOption[]>([]);
  const [lists, setLists] = useState<readonly ListOption[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingLists, setLoadingLists] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadBoards = async (): Promise<void> => {
      setLoadingBoards(true);
      try {
        if (workspaceId != null && workspaceId.trim() !== '') {
          const response = await api.getBoardsByWorkspace(workspaceId);
          const options = mapBoardSummariesToOptions(response.boards ?? []);
          if (!cancelled) {
            setBoards(options);
          }
        } else if (!cancelled) {
          setBoards([{ id: currentBoardId, name: currentBoardName }]);
        }
      } catch {
        if (!cancelled) {
          setBoards([{ id: currentBoardId, name: currentBoardName }]);
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
  }, [workspaceId, currentBoardId, currentBoardName]);

  useEffect(() => {
    let cancelled = false;
    const loadLists = async (): Promise<void> => {
      if (targetBoardId.trim() === '') {
        return;
      }
      setLoadingLists(true);
      try {
        const response = await api.getListsByBoard(targetBoardId);
        const options = mapListSummariesToOptions(response.lists);
        if (!cancelled) {
          setLists(options);
          const preferred =
            targetBoardId === currentBoardId && options.some((l) => l.id === currentListId)
              ? currentListId
              : (options[0]?.id ?? '');
          if (
            preferred !== '' &&
            (targetListId === '' || !options.some((l) => l.id === targetListId))
          ) {
            onTargetListIdChange(preferred);
          }
        }
      } catch {
        if (!cancelled) {
          setLists([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingLists(false);
        }
      }
    };
    void loadLists();
    return () => {
      cancelled = true;
    };
  }, [targetBoardId, currentBoardId, currentListId, targetListId, onTargetListIdChange]);

  const boardSelectData = useMemo(
    () => boards.map((board) => ({ value: board.id, label: board.name })),
    [boards],
  );

  const listSelectData = useMemo(
    () => lists.map((list) => ({ value: list.id, label: list.name })),
    [lists],
  );

  const resolvedTargetListId = useMemo((): string => {
    if (targetListId !== '' && lists.some((list) => list.id === targetListId)) {
      return targetListId;
    }
    if (
      targetBoardId === currentBoardId &&
      lists.some((list) => list.id === currentListId)
    ) {
      return currentListId;
    }
    return lists[0]?.id ?? '';
  }, [targetListId, lists, targetBoardId, currentBoardId, currentListId]);

  if (loadingBoards) {
    return (
      <Stack gap="md" align="center" py="md">
        <Loader size="sm" />
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Select
        label="Target board"
        value={targetBoardId}
        onChange={(value) => onTargetBoardIdChange(value ?? currentBoardId)}
        data={boardSelectData}
        required
        disabled={disabled || boardSelectData.length <= 1}
        searchable={boardSelectData.length > 8}
        allowDeselect={false}
      />
      {loadingLists ? (
        <Loader size="sm" />
      ) : (
        <Select
          label={listLabel}
          description={listDescription}
          value={resolvedTargetListId}
          onChange={(value) => onTargetListIdChange(value ?? '')}
          data={listSelectData}
          required
          disabled={disabled || listSelectData.length === 0}
          searchable={listSelectData.length > 8}
          allowDeselect={false}
        />
      )}
    </Stack>
  );
}
