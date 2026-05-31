import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import {
  compareUserRowsByDisplayName,
  isSearchRequestCancelled,
  memberUserMatchesQuery,
  MEMBER_DIRECTORY_PAGE_LIMIT,
  sortDirectoryUserRows,
} from '../../hooks/members/memberDirectoryUtils.js';
import { api } from '../../utils/api.js';
import { type AppAdminUserRow } from '../../components/admin/appAdminMemberTypes.js';

function adminMatchesQuery(admin: AppAdminUserRow, query: string): boolean {
  return memberUserMatchesQuery(admin, query);
}

export function useAppAdminMemberManagement(
  appAdmins: readonly AppAdminUserRow[],
  onAppAdminsChange: () => Promise<void>,
) {
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [directoryUsers, setDirectoryUsers] = useState<AppAdminUserRow[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryLoadingMore, setDirectoryLoadingMore] = useState(false);
  const [directoryNextCursor, setDirectoryNextCursor] = useState<string | undefined>(undefined);
  const [memberFilterQuery, setMemberFilterQuery] = useState('');
  const directoryPagingLockRef = useRef(false);
  const directoryQueryRef = useRef(directoryQuery);
  directoryQueryRef.current = directoryQuery;

  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      setDirectoryLoading(true);
      setDirectoryNextCursor(undefined);
      try {
        const response = await api.searchUsers(directoryQuery, {
          appAdminDirectory: true,
          limit: MEMBER_DIRECTORY_PAGE_LIMIT,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const users = (response.users as AppAdminUserRow[]) || [];
        setDirectoryUsers(sortDirectoryUserRows(users));
        setDirectoryNextCursor(
          response.nextCursor !== undefined && response.nextCursor !== ''
            ? response.nextCursor
            : undefined,
        );
      } catch (error) {
        if (isSearchRequestCancelled(error)) return;
        console.error('Error loading user directory:', error);
        notifications.show({
          color: 'red',
          title: 'Could not load users',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        if (!controller.signal.aborted) {
          setDirectoryUsers([]);
          setDirectoryNextCursor(undefined);
        }
      } finally {
        if (!controller.signal.aborted) {
          setDirectoryLoading(false);
        }
      }
    };
    void run();
    return () => controller.abort();
  }, [directoryQuery]);

  const handleDirectoryEndReached = useCallback(() => {
    if (
      directoryNextCursor === undefined ||
      directoryLoading ||
      directoryLoadingMore ||
      directoryPagingLockRef.current
    ) {
      return;
    }
    directoryPagingLockRef.current = true;
    setDirectoryLoadingMore(true);
    const querySnapshot = directoryQuery;
    const cursorSnapshot = directoryNextCursor;
    void (async () => {
      try {
        const response = await api.searchUsers(querySnapshot, {
          appAdminDirectory: true,
          limit: MEMBER_DIRECTORY_PAGE_LIMIT,
          cursor: cursorSnapshot,
        });
        if (directoryQueryRef.current !== querySnapshot) {
          return;
        }
        const newUsers = (response.users as AppAdminUserRow[]) ?? [];
        setDirectoryUsers((prev) => {
          const seen = new Set(prev.map((u) => u._id));
          const merged = [...prev];
          for (const u of newUsers) {
            if (!seen.has(u._id)) {
              seen.add(u._id);
              merged.push(u);
            }
          }
          return sortDirectoryUserRows(merged);
        });
        setDirectoryNextCursor(
          response.nextCursor !== undefined && response.nextCursor !== ''
            ? response.nextCursor
            : undefined,
        );
      } catch (error) {
        console.error('Error loading more directory users:', error);
        notifications.show({
          color: 'red',
          title: 'Could not load more users',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        directoryPagingLockRef.current = false;
        setDirectoryLoadingMore(false);
      }
    })();
  }, [directoryNextCursor, directoryLoading, directoryLoadingMore, directoryQuery]);

  const filteredAdmins = useMemo(() => {
    if (memberFilterQuery.trim() === '') return [...appAdmins].sort(compareUserRowsByDisplayName);
    return appAdmins.filter((a) => adminMatchesQuery(a, memberFilterQuery));
  }, [appAdmins, memberFilterQuery]);

  const handleAdd = useCallback(
    async (user: AppAdminUserRow) => {
      setDirectoryUsers((prev) => prev.filter((u) => u._id !== user._id));
      try {
        await api.addAppAdmin(user._id);
        await onAppAdminsChange();
        notifications.show({
          color: 'green',
          title: 'App Admin added',
          message: `${user.displayName} can now access Admin Configuration.`,
        });
      } catch (error) {
        setDirectoryUsers((prev) => (prev.some((u) => u._id === user._id) ? prev : sortDirectoryUserRows([...prev, user])));
        notifications.show({
          color: 'red',
          title: 'Could not add App Admin',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [onAppAdminsChange],
  );

  const handleRemove = useCallback(
    async (user: AppAdminUserRow) => {
      try {
        await api.removeAppAdmin(user._id);
        await onAppAdminsChange();
        setDirectoryUsers((prev) => (prev.some((u) => u._id === user._id) ? prev : sortDirectoryUserRows([...prev, user])));
        notifications.show({
          color: 'green',
          title: 'App Admin removed',
          message: `${user.displayName} is no longer an App Admin.`,
        });
      } catch (error) {
        notifications.show({
          color: 'red',
          title: 'Could not remove App Admin',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [onAppAdminsChange],
  );

  return {
    directoryQuery,
    setDirectoryQuery,
    directoryUsers,
    directoryLoading,
    directoryLoadingMore,
    memberFilterQuery,
    setMemberFilterQuery,
    filteredAdmins,
    handleDirectoryEndReached,
    handleAdd,
    handleRemove,
  };
}

export type { AppAdminUserRow };
