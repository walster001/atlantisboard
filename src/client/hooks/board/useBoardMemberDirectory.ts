import { useCallback, useEffect, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { api } from '../../utils/api.js';
import {
  isSearchRequestCancelled,
  MEMBER_DIRECTORY_PAGE_LIMIT,
  sortDirectoryUserRows,
} from '../members/memberDirectoryUtils.js';
import { type RoleKey } from '../../../shared/permissions/catalog.js';
import { type UserRow } from '../../components/board/BoardMemberTableParts.js';

export interface UseBoardMemberDirectoryOptions {
  readonly boardId: string;
  readonly directoryRefreshKey: number;
  readonly canUpdateMemberRole: boolean;
}

export function useBoardMemberDirectory({
  boardId,
  directoryRefreshKey,
  canUpdateMemberRole,
}: UseBoardMemberDirectoryOptions) {
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [directoryUsers, setDirectoryUsers] = useState<UserRow[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryLoadingMore, setDirectoryLoadingMore] = useState(false);
  const [directoryNextCursor, setDirectoryNextCursor] = useState<string | undefined>(undefined);
  const [addRoles, setAddRoles] = useState<Record<string, RoleKey>>({});

  const addRolesRef = useRef(addRoles);
  const directoryUsersRef = useRef(directoryUsers);
  const directoryQueryRef = useRef(directoryQuery);
  const boardIdRef = useRef(boardId);
  const directoryPagingLockRef = useRef(false);
  addRolesRef.current = addRoles;
  directoryUsersRef.current = directoryUsers;
  directoryQueryRef.current = directoryQuery;
  boardIdRef.current = boardId;

  useEffect(() => {
    if (!boardId) {
      return undefined;
    }

    const controller = new AbortController();

    const run = async () => {
      setDirectoryLoading(true);
      setDirectoryNextCursor(undefined);
      try {
        const response = await api.searchUsers(directoryQuery, {
          boardId,
          limit: MEMBER_DIRECTORY_PAGE_LIMIT,
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          return;
        }
        const users = (response.users as UserRow[]) || [];
        setDirectoryUsers(sortDirectoryUserRows(users));
        setDirectoryNextCursor(
          response.nextCursor !== undefined && response.nextCursor !== ''
            ? response.nextCursor
            : undefined,
        );
        setAddRoles((prev) => {
          const next: Record<string, RoleKey> = {};
          for (const u of users) {
            next[u._id] = prev[u._id] ?? 'viewer';
          }
          return next;
        });
      } catch (error) {
        if (isSearchRequestCancelled(error)) {
          return;
        }
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

    return () => {
      controller.abort();
    };
  }, [boardId, directoryQuery, directoryRefreshKey]);

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
    const querySnapshot = directoryQueryRef.current;
    const boardIdSnapshot = boardId;
    const cursorSnapshot = directoryNextCursor;
    void (async () => {
      try {
        const response = await api.searchUsers(querySnapshot, {
          boardId: boardIdSnapshot,
          limit: MEMBER_DIRECTORY_PAGE_LIMIT,
          cursor: cursorSnapshot,
        });
        if (
          boardIdRef.current !== boardIdSnapshot ||
          directoryQueryRef.current !== querySnapshot
        ) {
          return;
        }
        const newUsers = (response.users as UserRow[]) ?? [];
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
        setAddRoles((prev) => {
          const next: Record<string, RoleKey> = { ...prev };
          for (const u of newUsers) {
            if (next[u._id] === undefined) {
              next[u._id] = 'viewer';
            }
          }
          return next;
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
  }, [boardId, directoryLoading, directoryLoadingMore, directoryNextCursor]);

  const handleDirectoryRoleChange = useCallback(
    (userId: string, roleKey: RoleKey) => {
      if (!canUpdateMemberRole) {
        return;
      }
      setAddRoles((prev) => ({ ...prev, [userId]: roleKey }));
    },
    [canUpdateMemberRole],
  );

  return {
    directoryQuery,
    setDirectoryQuery,
    directoryUsers,
    directoryLoading,
    directoryLoadingMore,
    directoryNextCursor,
    addRoles,
    setAddRoles,
    addRolesRef,
    directoryUsersRef,
    setDirectoryUsers,
    handleDirectoryEndReached,
    handleDirectoryRoleChange,
  };
}
