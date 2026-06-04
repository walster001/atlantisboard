import { useEffect, useMemo, useState } from 'react';
import { Loader, Select, Stack, Text } from '@mantine/core';
import { api } from '../../utils/api.js';
import { mapListSummariesToOptions } from '../../utils/api/listApiMethods.js';
import { useDuplicateTargetBoardOptions } from '../../hooks/useDuplicateTargetBoardOptions.js';
import type { DuplicateTargetKind } from '../../utils/duplicateTargetPermissions.js';

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
  readonly duplicateKind: DuplicateTargetKind;
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
  duplicateKind,
  disabled = false,
  listLabel = 'Target list',
  listDescription,
}: DuplicateTargetBoardListPickerProps): React.ReactElement {
  const { boards, loading: loadingBoards } = useDuplicateTargetBoardOptions({
    workspaceId,
    currentBoardId,
    currentBoardName,
    kind: duplicateKind,
  });
  const [lists, setLists] = useState<readonly ListOption[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);

  useEffect(() => {
    if (loadingBoards || boards.length === 0) {
      return;
    }
    if (!boards.some((board) => board.id === targetBoardId)) {
      const preferred =
        boards.find((board) => board.id === currentBoardId)?.id ?? boards[0]?.id ?? currentBoardId;
      onTargetBoardIdChange(preferred);
    }
  }, [boards, loadingBoards, targetBoardId, currentBoardId, onTargetBoardIdChange]);

  useEffect(() => {
    let cancelled = false;
    const loadLists = async (): Promise<void> => {
      if (targetBoardId.trim() === '') {
        return;
      }
      if (!boards.some((board) => board.id === targetBoardId)) {
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
  }, [targetBoardId, currentBoardId, currentListId, targetListId, onTargetListIdChange, boards]);

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

  if (boardSelectData.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {duplicateKind === 'list'
          ? 'No boards in this workspace allow creating lists.'
          : 'No boards in this workspace allow creating cards.'}
      </Text>
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
