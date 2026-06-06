import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WorkspaceDB } from '../store/database.js';
import { api } from '../utils/api.js';
import { socketClient } from '../utils/socket.js';

const FETCH_CHUNK = 10;

export type WorkspacePermissionKey =
  | 'workspaces.view'
  | 'workspaces.update'
  | 'workspaces.delete'
  | 'workspaces.members.view'
  | 'workspaces.members.add'
  | 'workspaces.members.remove'
  | 'workspaces.members.role.update'
  | 'boards.create'
  | 'import.trello'
  | 'import.wekan';

async function fetchWorkspacePermissionsChunked(
  workspaceIds: readonly string[],
): Promise<Map<string, ReadonlySet<string>>> {
  const out = new Map<string, ReadonlySet<string>>();
  for (let i = 0; i < workspaceIds.length; i += FETCH_CHUNK) {
    const slice = workspaceIds.slice(i, i + FETCH_CHUNK);
    const rows = await Promise.all(
      slice.map(async (id) => {
        try {
          const r = await api.getMyWorkspacePermissions(id);
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
 * Effective workspace ACLs for the home page (custom + built-in roles), batched per workspace id.
 */
export function useHomeWorkspacePermissionsBatch(
  userId: string | undefined,
  workspaces: readonly WorkspaceDB[],
): {
  readonly loaded: boolean;
  readonly can: (workspaceId: string, key: WorkspacePermissionKey) => boolean;
  readonly hasWorkspaceUpdate: (workspaceId: string) => boolean;
} {
  const [byId, setById] = useState<Map<string, ReadonlySet<string>>>(new Map());
  const [loaded, setLoaded] = useState(false);

  const stableIds = useMemo(() => {
    const u = new Set<string>();
    for (const w of workspaces) {
      if (w.boardScopedHomeOnly !== true) {
        u.add(w.id);
      }
    }
    return [...u].sort().join(',');
  }, [workspaces]);

  useEffect(() => {
    let cancelled = false;
    if (userId === undefined || userId === '') {
      setById(new Map());
      setLoaded(true);
      return () => {
        cancelled = true;
      };
    }
    const ids = stableIds === '' ? [] : stableIds.split(',');
    if (ids.length === 0) {
      setById(new Map());
      setLoaded(true);
      return () => {
        cancelled = true;
      };
    }
    setLoaded(false);
    void fetchWorkspacePermissionsChunked(ids).then((next) => {
      if (!cancelled) {
        setById(next);
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
      void fetchWorkspacePermissionsChunked(ids).then((next) => {
        if (!cancelled) {
          setById(next);
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
    (workspaceId: string, key: WorkspacePermissionKey): boolean => {
      return byId.get(workspaceId)?.has(key) ?? false;
    },
    [byId],
  );

  const hasWorkspaceUpdate = useCallback(
    (workspaceId: string): boolean => {
      return can(workspaceId, 'workspaces.update');
    },
    [can],
  );

  return { loaded, can, hasWorkspaceUpdate };
}
