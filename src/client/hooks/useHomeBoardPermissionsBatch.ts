import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BoardDB } from '../store/database.js';
import { api } from '../utils/api.js';
import { socketClient } from '../utils/socket.js';
import type { BoardPermissionKey } from './useBoardPermissions.js';

const FETCH_CHUNK = 12;

async function fetchPermissionsChunked(boardIds: readonly string[]): Promise<Map<string, ReadonlySet<string>>> {
  const out = new Map<string, ReadonlySet<string>>();
  for (let i = 0; i < boardIds.length; i += FETCH_CHUNK) {
    const slice = boardIds.slice(i, i + FETCH_CHUNK);
    const rows = await Promise.all(
      slice.map(async (id) => {
        try {
          const r = await api.getMyBoardPermissions(id);
          return { id, perms: new Set(r.permissions ?? []) };
        } catch {
          return { id, perms: new Set<string>() };
        }
      }),
    );
    for (const { id, perms } of rows) {
      out.set(id, perms);
    }
  }
  return out;
}

/**
 * One request set per visible home board — aligns drag/reorder/menu with `hasPermission` (custom roles, workspace roles).
 */
export function useHomeBoardPermissionsBatch(
  userId: string | undefined,
  boards: readonly BoardDB[],
): {
  readonly loaded: boolean;
  readonly can: (boardId: string, key: BoardPermissionKey) => boolean;
  readonly canDragBoardOnHome: (board: BoardDB) => boolean;
  readonly canReorderAllBoardsInScope: (uid: string, scope: readonly BoardDB[]) => boolean;
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
    void fetchPermissionsChunked(ids).then((next) => {
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
    const socket = socketClient.getSocket();
    if (!socket || stableIds === '' || userId === undefined || userId === '') {
      return undefined;
    }
    const ids = stableIds.split(',');
    let cancelled = false;
    const handler = (): void => {
      void fetchPermissionsChunked(ids).then((next) => {
        if (!cancelled) {
          setByBoardId(next);
          setLoaded(true);
        }
      });
    };
    socket.on('permissions.updated', handler);
    return () => {
      cancelled = true;
      socket.off('permissions.updated', handler);
    };
  }, [userId, stableIds]);

  const can = useCallback(
    (boardId: string, key: BoardPermissionKey): boolean => {
      return byBoardId.get(boardId)?.has(key) ?? false;
    },
    [byBoardId],
  );

  const hasBoardUpdate = useCallback(
    (boardId: string): boolean => {
      return can(boardId, 'boards.update');
    },
    [can],
  );

  const canDragBoardOnHome = useCallback(
    (board: BoardDB): boolean => {
      if (userId === undefined || userId === '') {
        return false;
      }
      if (board.ownerId === userId) {
        return true;
      }
      if (!loaded) {
        return false;
      }
      return (
        can(board.id, 'boards.reorder_in_home') ||
        can(board.id, 'boards.update')
      );
    },
    [userId, loaded, can],
  );

  const canReorderAllBoardsInScope = useCallback(
    (uid: string, scope: readonly BoardDB[]): boolean => {
      if (uid === '') {
        return false;
      }
      if (scope.length === 0) {
        return false;
      }
      if (!loaded) {
        return scope.every((b) => b.ownerId === uid);
      }
      return scope.every((b) => {
        if (b.ownerId === uid) {
          return true;
        }
        return can(b.id, 'boards.reorder_in_home') || can(b.id, 'boards.update');
      });
    },
    [loaded, can],
  );

  return { loaded, can, canDragBoardOnHome, canReorderAllBoardsInScope, hasBoardUpdate };
}
