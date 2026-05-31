import { useEffect, useMemo, useState } from 'react';
import type { BoardPermissionKey } from '../../shared/permissions/catalog.js';
import { api } from '../utils/api.js';
import { socketClient } from '../utils/socket.js';
import { db } from '../store/database.js';
import { subscribeSocketBoardUpdated } from '../utils/socketRealtimeBridge.js';

export type { BoardPermissionKey };

/** Derived on the board page from allowed permission keys — gates Kanban list/card chrome. */
export interface KanbanBoardEditCaps {
  readonly canAddList: boolean;
  readonly canListMenu: boolean;
  readonly canDuplicateList: boolean;
  readonly canAddCard: boolean;
  readonly canCardKanbanMenu: boolean;
  readonly canDuplicateCard: boolean;
  /** Card body drag: reorder within list and/or move between lists. */
  readonly canDragKanbanCards: boolean;
  /** List column reorder drag from title row. */
  readonly canReorderLists: boolean;
}

export function useBoardPermissions(
  boardId: string | undefined,
  /** When known (e.g. from loaded board), avoids a Dexie round-trip and matches workspace-scoped `permissions.updated` immediately. */
  boardWorkspaceId?: string | null,
): {
  readonly can: (key: BoardPermissionKey) => boolean;
  readonly permissions: readonly BoardPermissionKey[];
  readonly loaded: boolean;
} {
  const [permissions, setPermissions] = useState<readonly BoardPermissionKey[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [resolvedWorkspaceId, setResolvedWorkspaceId] = useState('');

  useEffect(() => {
    if (!boardId) {
      setPermissions([]);
      setLoaded(false);
      return;
    }
    let cancelled = false;
    void api
      .getMyBoardPermissions(boardId)
      .then((r) => {
        if (!cancelled) {
          setPermissions((r.permissions ?? []) as BoardPermissionKey[]);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPermissions([]);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  useEffect(() => {
    if (!boardId) {
      setResolvedWorkspaceId('');
      return;
    }
    const fromProp = boardWorkspaceId?.trim() ?? '';
    if (fromProp !== '') {
      setResolvedWorkspaceId(fromProp);
      return;
    }
    let cancelled = false;
    void db.boards.get(boardId).then((b) => {
      if (cancelled) {
        return;
      }
      const w = b?.workspaceId != null ? String(b.workspaceId).trim() : '';
      setResolvedWorkspaceId(w);
    });
    return () => {
      cancelled = true;
    };
  }, [boardId, boardWorkspaceId]);

  useEffect(() => {
    if (!boardId || (boardWorkspaceId?.trim() ?? '') !== '') {
      return undefined;
    }
    const unsub = subscribeSocketBoardUpdated(({ boardId: bid, board }) => {
      if (bid !== boardId) {
        return;
      }
      const w = board.workspaceId != null ? String(board.workspaceId).trim() : '';
      if (w !== '') {
        setResolvedWorkspaceId(w);
      }
    });
    return unsub;
  }, [boardId, boardWorkspaceId]);

  useEffect(() => {
    const socket = socketClient.getSocket();
    if (!socket || !boardId) {
      return;
    }
    let refetchGen = 0;
    const refetch = (): void => {
      const g = ++refetchGen;
      void api
        .getMyBoardPermissions(boardId)
        .then((r) => {
          if (g !== refetchGen) {
            return;
          }
          setPermissions((r.permissions ?? []) as BoardPermissionKey[]);
          setLoaded(true);
        })
        .catch(() => {
          if (g !== refetchGen) {
            return;
          }
          setPermissions([]);
          setLoaded(true);
        });
    };
    const handler = (p: { boardId?: string; workspaceId?: string }) => {
      const eventBoard = typeof p?.boardId === 'string' ? p.boardId.trim() : '';
      const eventWs = typeof p?.workspaceId === 'string' ? p.workspaceId.trim() : '';
      const matchesBoard = eventBoard !== '' && eventBoard === boardId;
      const matchesWorkspace =
        eventWs !== '' &&
        resolvedWorkspaceId !== '' &&
        eventWs === resolvedWorkspaceId;
      if (!matchesBoard && !matchesWorkspace) {
        return;
      }
      refetch();
    };
    socket.on('permissions.updated', handler);
    return () => {
      refetchGen += 1;
      socket.off('permissions.updated', handler);
    };
  }, [boardId, resolvedWorkspaceId]);

  const set = useMemo(() => new Set(permissions), [permissions]);
  return {
    permissions,
    loaded,
    can: (key) => set.has(key),
  };
}

