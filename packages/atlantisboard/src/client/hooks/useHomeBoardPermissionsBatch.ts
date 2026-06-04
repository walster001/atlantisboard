import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BoardDB } from '../store/database.js';
import { fetchBoardPermissionsChunked } from '../utils/boardPermissionsBatchFetch.js';
import { socketClient } from '../utils/socket.js';
import type { BoardPermissionKey } from './useBoardPermissions.js';

/**
 * One request set per visible home board — for board menus and cross-workspace moves.
 * Home tile order within a row is per-user and does not use `boards.reorder_in_home`.
 */
export function useHomeBoardPermissionsBatch(
  userId: string | undefined,
  boards: readonly BoardDB[],
): {
  readonly loaded: boolean;
  readonly can: (boardId: string, key: BoardPermissionKey) => boolean;
  readonly canDragBoardOnHome: (board: BoardDB) => boolean;
  readonly hasBoardUpdate: (boardId: string) => boolean;
} {
  const [byBoardId, setByBoardId] = useState<Map<string, ReadonlySet<string>>>(new Map());
  const [loaded, setLoaded] = useState(false);

  const stableIds = useMemo(() => {
    const u = new Set<string>();
    for (const b of boards) {
      u.add(b.id);
    }
    return [...u].sort().join(',');
  }, [boards]);

  useEffect(() => {
    let cancelled = false;
    if (userId === undefined || userId === '') {
      setByBoardId(new Map());
      setLoaded(true);
      return () => {
        cancelled = true;
      };
    }
    const ids = stableIds === '' ? [] : stableIds.split(',');
    if (ids.length === 0) {
      setByBoardId(new Map());
      setLoaded(true);
      return () => {
        cancelled = true;
      };
    }
    setLoaded(false);
    void fetchBoardPermissionsChunked(ids).then((next) => {
      if (!cancelled) {
        setByBoardId(next);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, stableIds]);

  useEffect(() => {
    if (userId === undefined || userId === '') {
      return;
    }
    const ids = stableIds === '' ? [] : stableIds.split(',');
    if (ids.length === 0) {
      return;
    }
    const onInvalidate = (): void => {
      void fetchBoardPermissionsChunked(ids).then((next) => {
        setByBoardId(next);
        setLoaded(true);
      });
    };
    socketClient.on('permissions:invalidate', onInvalidate);
    return () => {
      socketClient.off('permissions:invalidate', onInvalidate);
    };
  }, [userId, stableIds]);

  const can = useCallback(
    (boardId: string, key: BoardPermissionKey): boolean => {
      if (!loaded) {
        return false;
      }
      return byBoardId.get(boardId)?.has(key) ?? false;
    },
    [loaded, byBoardId],
  );

  const hasBoardUpdate = useCallback(
    (boardId: string): boolean => {
      const board = boards.find((b) => b.id === boardId);
      if (board?.ownerId === userId) {
        return true;
      }
      return can(boardId, 'boards.update');
    },
    [boards, userId, can],
  );

  /** Any signed-in user who sees a board on home may drag it (reorder is per-user; cross-workspace moves are gated on drop). */
  const canDragBoardOnHome = useCallback(
    (_board: BoardDB): boolean => {
      return userId != null && userId !== '';
    },
    [userId],
  );

  return { loaded, can, canDragBoardOnHome, hasBoardUpdate };
}
