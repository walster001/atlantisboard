import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '../contexts/AuthContext.js';
import { api } from '../utils/api.js';
import {
  mapBoardSummariesToOptions,
  type BoardSummaryOption,
} from '../utils/api/boardApiMethods.js';
import { fetchBoardPermissionsChunked } from '../utils/boardPermissionsBatchFetch.js';
import {
  boardAllowsDuplicateTarget,
  DUPLICATE_TARGET_BOARD_PERMISSIONS_BY_KIND,
  type DuplicateTargetKind,
} from '../utils/duplicateTargetPermissions.js';
import type { BoardPermissionKey } from './useBoardPermissions.js';

interface UseDuplicateTargetBoardOptionsParams {
  readonly workspaceId: string | undefined;
  readonly currentBoardId: string;
  readonly currentBoardName: string;
  readonly kind: DuplicateTargetKind;
}

export function useDuplicateTargetBoardOptions({
  workspaceId,
  currentBoardId,
  currentBoardName,
  kind,
}: UseDuplicateTargetBoardOptionsParams): {
  readonly boards: readonly BoardSummaryOption[];
  readonly loading: boolean;
  readonly can: (boardId: string, key: BoardPermissionKey) => boolean;
} {
  const { user } = useAuthContext();
  const userId = user?.id;
  const [allBoards, setAllBoards] = useState<readonly BoardSummaryOption[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [byBoardId, setByBoardId] = useState<Map<string, ReadonlySet<string>>>(new Map());
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  const requiredPermissions = DUPLICATE_TARGET_BOARD_PERMISSIONS_BY_KIND[kind];

  const stableBoardIds = useMemo(
    () =>
      allBoards
        .map((board) => board.id)
        .sort()
        .join(','),
    [allBoards],
  );

  useEffect(() => {
    let cancelled = false;
    const loadBoards = async (): Promise<void> => {
      setLoadingBoards(true);
      try {
        if (workspaceId != null && workspaceId.trim() !== '') {
          const response = await api.getBoardsByWorkspace(workspaceId);
          const options = mapBoardSummariesToOptions(response.boards ?? []);
          if (!cancelled) {
            setAllBoards(options);
          }
        } else if (!cancelled) {
          setAllBoards([{ id: currentBoardId, name: currentBoardName }]);
        }
      } catch {
        if (!cancelled) {
          setAllBoards([{ id: currentBoardId, name: currentBoardName }]);
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
    const ids = stableBoardIds === '' ? [] : stableBoardIds.split(',');
    if (ids.length === 0) {
      setByBoardId(new Map());
      setPermissionsLoaded(true);
      return () => {
        cancelled = true;
      };
    }
    setPermissionsLoaded(false);
    void fetchBoardPermissionsChunked(ids).then((next) => {
      if (!cancelled) {
        setByBoardId(next);
        setPermissionsLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [stableBoardIds]);

  const can = useCallback(
    (boardId: string, key: BoardPermissionKey): boolean => {
      if (!permissionsLoaded) {
        return false;
      }
      return byBoardId.get(boardId)?.has(key) ?? false;
    },
    [permissionsLoaded, byBoardId],
  );

  const boards = useMemo((): readonly BoardSummaryOption[] => {
    if (!permissionsLoaded) {
      return [];
    }
    return allBoards.filter((board) =>
      boardAllowsDuplicateTarget(board.id, board.ownerId, userId, can, requiredPermissions),
    );
  }, [allBoards, permissionsLoaded, userId, can, requiredPermissions]);

  return {
    boards,
    loading: loadingBoards || !permissionsLoaded,
    can,
  };
}
