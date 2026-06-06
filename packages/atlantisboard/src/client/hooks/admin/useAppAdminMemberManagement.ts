import { useCallback, useMemo, useState } from 'react';
import { notifications } from '@mantine/notifications';
import {
  compareUserRowsByDisplayName,
  memberUserMatchesQuery,
  sortDirectoryUserRows,
} from '../../hooks/members/memberDirectoryUtils.js';
import { useMemberDirectorySearch } from '../../hooks/members/useMemberDirectorySearch.js';
import { api } from '../../utils/api.js';
import { type AppAdminUserRow } from '../../components/admin/appAdminMemberTypes.js';

function adminMatchesQuery(admin: AppAdminUserRow, query: string): boolean {
  return memberUserMatchesQuery(admin, query);
}

export function useAppAdminMemberManagement(
  appAdmins: readonly AppAdminUserRow[],
  onAppAdminsChange: () => Promise<void>,
) {
  const [memberFilterQuery, setMemberFilterQuery] = useState('');

  const {
    directoryQuery,
    setDirectoryQuery,
    directoryUsers,
    setDirectoryUsers,
    directoryLoading,
    directoryLoadingMore,
    handleDirectoryEndReached,
  } = useMemberDirectorySearch<AppAdminUserRow>({
    scope: 'app-admin',
    mapUsers: (users) => users as AppAdminUserRow[],
  });

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
    [onAppAdminsChange, setDirectoryUsers],
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
    [onAppAdminsChange, setDirectoryUsers],
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
