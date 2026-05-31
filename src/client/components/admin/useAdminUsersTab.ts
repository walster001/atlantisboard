import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { api } from '../../utils/api.js';
import {
  draftFromUsers,
  MASTER_DELETE_PROGRESS_NOTIFICATION_ID,
  masterCheckboxState,
  PAGE_LIMIT,
  renderMasterDeleteProgressMessage,
  type AdminUserRow,
  type UserCapabilityDraft,
} from './adminUsersTabUtils.js';

export function useAdminUsersTab() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [draftCaps, setDraftCaps] = useState<Record<string, UserCapabilityDraft>>({});
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savingCaps, setSavingCaps] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<AdminUserRow | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const nextCursorRef = useRef<string | undefined>(undefined);
  const pagingLockRef = useRef(false);

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  const loadUsers = useCallback(async (next?: string): Promise<void> => {
    if (next != null) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError(null);
    }
    try {
      const response = await api.getAdminUsers({
        q: query,
        limit: PAGE_LIMIT,
        ...(next != null ? { cursor: next } : {}),
      });
      const incoming = response.users;
      if (next != null) {
        setUsers((prev) => {
          const seen = new Set(prev.map((u) => u._id));
          const merged = [...prev];
          for (const row of incoming) {
            if (!seen.has(row._id)) {
              seen.add(row._id);
              merged.push(row);
            }
          }
          return merged;
        });
        setDraftCaps((prev) => {
          const merged = { ...prev };
          for (const row of incoming) {
            if (merged[row._id] === undefined) {
              merged[row._id] = {
                canImportBoards: row.canImportBoards,
                canCreateWorkspace: row.canCreateWorkspace,
              };
            }
          }
          return merged;
        });
      } else {
        setUsers(incoming);
        setDraftCaps(draftFromUsers(incoming));
      }
      setNextCursor(response.nextCursor);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load users';
      setError(message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [query]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => {
        const byName = a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
        if (byName !== 0) {
          return byName;
        }
        return a.email.localeCompare(b.email, undefined, { sensitivity: 'base' });
      }),
    [users],
  );

  const savedCaps = useMemo(() => draftFromUsers(users), [users]);

  const capabilityUpdates = useMemo(() => {
    const updates: Array<{
      userId: string;
      canImportBoards: boolean;
      canCreateWorkspace: boolean;
    }> = [];
    for (const user of users) {
      if (user.isAppAdmin) {
        continue;
      }
      const draft = draftCaps[user._id];
      const saved = savedCaps[user._id];
      if (draft === undefined || saved === undefined) {
        continue;
      }
      if (
        draft.canImportBoards !== saved.canImportBoards ||
        draft.canCreateWorkspace !== saved.canCreateWorkspace
      ) {
        updates.push({
          userId: user._id,
          canImportBoards: draft.canImportBoards,
          canCreateWorkspace: draft.canCreateWorkspace,
        });
      }
    }
    return updates;
  }, [users, draftCaps, savedCaps]);

  const hasUnsavedCapabilityChanges = capabilityUpdates.length > 0;

  const importMaster = useMemo(
    () => masterCheckboxState(sortedUsers, draftCaps, 'canImportBoards'),
    [sortedUsers, draftCaps],
  );
  const createWorkspaceMaster = useMemo(
    () => masterCheckboxState(sortedUsers, draftCaps, 'canCreateWorkspace'),
    [sortedUsers, draftCaps],
  );

  const setMasterCapability = useCallback(
    (field: keyof UserCapabilityDraft, checked: boolean): void => {
      setDraftCaps((prev) => {
        const next = { ...prev };
        for (const user of sortedUsers) {
          if (user.isAppAdmin) {
            continue;
          }
          const existing = next[user._id] ?? {
            canImportBoards: user.canImportBoards,
            canCreateWorkspace: user.canCreateWorkspace,
          };
          next[user._id] = { ...existing, [field]: checked };
        }
        return next;
      });
    },
    [sortedUsers],
  );

  const handleSaveCapabilities = useCallback(async (): Promise<void> => {
    if (capabilityUpdates.length === 0) {
      return;
    }
    setSavingCaps(true);
    setError(null);
    try {
      await api.updateAdminUserAccountCapabilities({ updates: capabilityUpdates });
      setUsers((prev) =>
        prev.map((user) => {
          const update = capabilityUpdates.find((entry) => entry.userId === user._id);
          if (update === undefined) {
            return user;
          }
          return {
            ...user,
            canImportBoards: update.canImportBoards,
            canCreateWorkspace: update.canCreateWorkspace,
          };
        }),
      );
      notifications.show({
        color: 'green',
        title: 'Saved',
        message: `Updated account capabilities for ${capabilityUpdates.length} user(s).`,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save account capabilities';
      setError(message);
      notifications.show({
        color: 'red',
        title: 'Save failed',
        message,
      });
    } finally {
      setSavingCaps(false);
    }
  }, [capabilityUpdates]);

  const handleDeleteConfirmed = useCallback(async (): Promise<void> => {
    if (!confirmDeleteUser) {
      return;
    }
    setDeletingUserId(confirmDeleteUser._id);
    notifications.show({
      id: MASTER_DELETE_PROGRESS_NOTIFICATION_ID,
      color: 'blue',
      title: 'Master delete in progress',
      message: renderMasterDeleteProgressMessage('Removing user data…', 25),
      loading: true,
      autoClose: false,
      withCloseButton: false,
      position: 'bottom-right',
    });
    try {
      const result = await api.deleteAdminUser(confirmDeleteUser._id);
      setUsers((prev) => prev.filter((u) => u._id !== confirmDeleteUser._id));
      setDraftCaps((prev) => {
        const next = { ...prev };
        delete next[confirmDeleteUser._id];
        return next;
      });
      const stats = result.stats;
      const successMessage = [
        `${confirmDeleteUser.displayName} removed successfully.`,
        `Workspaces: ${stats.removedWorkspaceMemberships}`,
        `Boards: ${stats.removedBoardMemberships}`,
        `Sessions: ${stats.deletedSessions}`,
        `Activities: ${stats.deletedActivities}`,
      ].join(' • ');
      notifications.update({
        id: MASTER_DELETE_PROGRESS_NOTIFICATION_ID,
        color: 'green',
        title: 'Master delete complete',
        message: successMessage,
        loading: false,
        autoClose: 9000,
        withCloseButton: true,
        position: 'bottom-right',
      });
      setConfirmDeleteUser(null);
    } catch (e) {
      notifications.update({
        id: MASTER_DELETE_PROGRESS_NOTIFICATION_ID,
        color: 'red',
        title: 'Master delete failed',
        message: e instanceof Error ? e.message : 'Could not delete user.',
        loading: false,
        autoClose: false,
        withCloseButton: true,
        position: 'bottom-right',
      });
    } finally {
      setDeletingUserId(null);
    }
  }, [confirmDeleteUser]);

  const handleImportChange = useCallback((userId: string, checked: boolean): void => {
    setDraftCaps((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] ?? { canImportBoards: false, canCreateWorkspace: false }),
        canImportBoards: checked,
      },
    }));
  }, []);

  const handleCreateWorkspaceChange = useCallback((userId: string, checked: boolean): void => {
    setDraftCaps((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] ?? { canImportBoards: false, canCreateWorkspace: false }),
        canCreateWorkspace: checked,
      },
    }));
  }, []);

  const handleDeleteClick = useCallback((user: AdminUserRow): void => {
    setConfirmDeleteUser(user);
  }, []);

  const handleEndReached = useCallback((): void => {
    const cursor = nextCursorRef.current;
    if (cursor == null || loading || loadingMore || pagingLockRef.current) {
      return;
    }
    pagingLockRef.current = true;
    void (async () => {
      try {
        await loadUsers(cursor);
      } finally {
        pagingLockRef.current = false;
      }
    })();
  }, [loadUsers, loading, loadingMore]);

  return {
    users,
    draftCaps,
    loading,
    loadingMore,
    savingCaps,
    query,
    setQuery,
    error,
    confirmDeleteUser,
    setConfirmDeleteUser,
    deletingUserId,
    sortedUsers,
    hasUnsavedCapabilityChanges,
    importMaster,
    createWorkspaceMaster,
    setMasterCapability,
    handleSaveCapabilities,
    handleDeleteConfirmed,
    handleImportChange,
    handleCreateWorkspaceChange,
    handleDeleteClick,
    handleEndReached,
  };
}

export type AdminUsersTabController = ReturnType<typeof useAdminUsersTab>;
