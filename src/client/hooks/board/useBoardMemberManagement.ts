import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { notifications } from '@mantine/notifications';
import { api } from '../../utils/api.js';
import { subscribeSocketBoardUpdated } from '../../utils/socketRealtimeBridge.js';
import { useBoardPermissions } from '../useBoardPermissions.js';
import { useResponsiveTier } from '../useResponsiveTier.js';
import { useMemberDirectorySearch } from '../members/useMemberDirectorySearch.js';
import { type RoleKey } from '../../../shared/permissions/catalog.js';
import {
  BUILTIN_ROLE_OPTIONS,
  BOARD_MEMBERS_LIST_PAGE_LIMIT,
  extractUser,
  type BoardMemberListItem,
  type BoardPayload,
  type UserRow,
} from '../../components/board/BoardMemberTableParts.js';
import {
  addBoardMemberFromDirectory,
  changeDirectoryAddRole,
  discardAllBoardImportPlaceholders,
  removeBoardMemberOptimistic,
  updateBoardMemberRole,
  type BoardMemberManagementHandlerDeps,
} from './boardMemberManagementHandlers.js';
import {
  buildBoardPayloadFromMemberRows,
  buildSortedMemberPanelRows,
  filterMemberPanelRowsByRole,
  mergeBoardPayloadWithPage,
} from './boardMemberPayloadUtils.js';

export function useBoardMemberManagement(boardId: string) {
  const responsiveTier = useResponsiveTier();
  const isMobileStackedLayout = responsiveTier === 'mobile';
  const { can, loaded: permissionsLoaded } = useBoardPermissions(boardId);
  const canAddMember = permissionsLoaded && can('boards.members.add');
  const canRemoveMember = permissionsLoaded && can('boards.members.remove');
  const canUpdateMemberRole = permissionsLoaded && can('boards.members.role.update');
  const [board, setBoard] = useState<BoardPayload | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);
  const [membersNextCursor, setMembersNextCursor] = useState<string | undefined>(undefined);
  const membersNextCursorRef = useRef<string | undefined>(undefined);
  membersNextCursorRef.current = membersNextCursor;
  const [discardPlaceholdersOpen, setDiscardPlaceholdersOpen] = useState(false);
  const [discardingPlaceholders, setDiscardingPlaceholders] = useState(false);
  const [addRoles, setAddRoles] = useState<Record<string, RoleKey>>({});
  const [roleOptions, setRoleOptions] = useState<Array<{ value: RoleKey; label: string }>>(
    () => [...BUILTIN_ROLE_OPTIONS],
  );
  /** Committed filter: applied only after Enter (initial '' shows everyone). */
  const [memberFilterQuery, setMemberFilterQuery] = useState('');
  const [memberRoleFilter, setMemberRoleFilter] = useState<RoleKey | null>(null);
  const [memberRoleFilterBoardId, setMemberRoleFilterBoardId] = useState(boardId);
  if (memberRoleFilterBoardId !== boardId) {
    setMemberRoleFilterBoardId(boardId);
    setMemberRoleFilter(null);
  }
  const [membersLoadingMore, setMembersLoadingMore] = useState(false);

  const addRolesRef = useRef(addRoles);
  const membersPagingLockRef = useRef(false);
  addRolesRef.current = addRoles;

  const [directoryRefreshKey, setDirectoryRefreshKey] = useState(0);

  const handleDirectoryUsersLoaded = useCallback(
    (users: readonly UserRow[], context: { readonly append: boolean; readonly query: string }) => {
      if (context.append) {
        setAddRoles((prev) => {
          const next: Record<string, RoleKey> = { ...prev };
          for (const user of users) {
            if (next[user._id] === undefined) {
              next[user._id] = 'viewer';
            }
          }
          return next;
        });
        return;
      }
      setAddRoles((prev) => {
        const next: Record<string, RoleKey> = {};
        for (const user of users) {
          next[user._id] = prev[user._id] ?? 'viewer';
        }
        return next;
      });
    },
    [],
  );

  const {
    directoryQuery,
    setDirectoryQuery,
    directoryUsers,
    setDirectoryUsers,
    directoryUsersRef,
    directoryLoading,
    handleDirectoryEndReached,
  } = useMemberDirectorySearch<UserRow>({
    scope: 'board',
    scopeId: boardId,
    refreshKey: directoryRefreshKey,
    mapUsers: (users) => users as UserRow[],
    onUsersLoaded: handleDirectoryUsersLoaded,
  });

  const loadBoard = useCallback(async (cursor?: string, opts?: { readonly quiet?: boolean }) => {
    const quiet = opts?.quiet === true;
    try {
      if (cursor === undefined) {
        if (!quiet) {
          setBoardLoading(true);
        }
      } else {
        setMembersLoadingMore(true);
      }
      const response = await api.getBoardMembers(boardId, {
        q: memberFilterQuery,
        sort: 'displayName:asc',
        limit: BOARD_MEMBERS_LIST_PAGE_LIMIT,
        ...(cursor !== undefined ? { cursor } : {}),
      });
      const rows = (response.members as BoardMemberListItem[]) ?? [];
      setMembersNextCursor(response.nextCursor);
      const next = buildBoardPayloadFromMemberRows(rows);
      setBoard((prev) => mergeBoardPayloadWithPage(prev, next, cursor));
    } catch (error) {
      console.error('Error loading board:', error);
      notifications.show({
        color: 'red',
        title: 'Could not load board',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      if (cursor !== undefined) {
        setMembersLoadingMore(false);
      }
      if (!quiet) {
        setBoardLoading(false);
      }
    }
  }, [boardId, memberFilterQuery]);

  const loadBoardRef = useRef(loadBoard);
  loadBoardRef.current = loadBoard;

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    return subscribeSocketBoardUpdated(({ boardId: bid, board }) => {
      if (bid !== boardId) {
        return;
      }
      if (board.members !== undefined) {
        void loadBoardRef.current(undefined, { quiet: true });
        setDirectoryRefreshKey((k) => k + 1);
      }
    });
  }, [boardId]);

  const fetchNextMemberPage = useCallback(async () => {
    const cursor = membersNextCursorRef.current;
    if (cursor === undefined || membersPagingLockRef.current) {
      return;
    }
    membersPagingLockRef.current = true;
    try {
      await loadBoard(cursor);
    } finally {
      membersPagingLockRef.current = false;
    }
  }, [loadBoard]);

  const handleMemberListEndReached = useCallback(() => {
    void fetchNextMemberPage();
  }, [fetchNextMemberPage]);

  useEffect(() => {
    let cancelled = false;
    void api
      .getBoardAssignableRoles(boardId)
      .then((r) => {
        if (cancelled) {
          return;
        }
        const roles = Array.isArray(r.roles) ? r.roles : [];
        const mapped = roles.map((role) => ({
          value: role.key as RoleKey,
          label: role.displayName,
        }));
        setRoleOptions(mapped.length > 0 ? mapped : [...BUILTIN_ROLE_OPTIONS]);
      })
      .catch(() => {
        if (!cancelled) {
          setRoleOptions([...BUILTIN_ROLE_OPTIONS]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const boardRef = useRef(board);
  boardRef.current = board;

  const owner = board?.ownerId ? extractUser(board.ownerId) : null;

  const sortedMemberPanelRows = useMemo(
    () => buildSortedMemberPanelRows(board, owner),
    [board, owner],
  );

  const filteredMemberPanelRows = useMemo(
    () => filterMemberPanelRowsByRole(sortedMemberPanelRows, memberRoleFilter),
    [sortedMemberPanelRows, memberRoleFilter],
  );

  const memberRoleFilterLabel = useMemo(() => {
    if (memberRoleFilter == null) {
      return null;
    }
    return roleOptions.find((option) => option.value === memberRoleFilter)?.label ?? memberRoleFilter;
  }, [memberRoleFilter, roleOptions]);

  const memberCount = filteredMemberPanelRows.length;

  const hasUnmappedDirectoryPlaceholders = useMemo(
    () => directoryUsers.some((u) => u.importPlaceholder === true && u.importNotMapped === true),
    [directoryUsers],
  );

  const handlerDeps = useMemo(
    (): BoardMemberManagementHandlerDeps => ({
      boardId,
      canAddMember,
      canRemoveMember,
      canUpdateMemberRole,
      addRolesRef,
      directoryUsersRef,
      boardRef,
      setDirectoryUsers,
      setBoard,
      setAddRoles,
      setDiscardPlaceholdersOpen,
      setDiscardingPlaceholders,
      loadBoard,
    }),
    [boardId, canAddMember, canRemoveMember, canUpdateMemberRole, loadBoard],
  );

  const handleDiscardAllPlaceholders = useCallback(async (): Promise<void> => {
    await discardAllBoardImportPlaceholders(handlerDeps);
  }, [handlerDeps]);

  const handleDirectoryRoleChange = useCallback((userId: string, roleKey: RoleKey) => {
    changeDirectoryAddRole(handlerDeps, userId, roleKey);
  }, [handlerDeps]);

  const handleAddUser = useCallback(
    async (userId: string) => {
      await addBoardMemberFromDirectory(handlerDeps, userId);
    },
    [handlerDeps],
  );

  const handleRemoveMember = useCallback(
    (userId: string) => {
      removeBoardMemberOptimistic(handlerDeps, userId);
    },
    [handlerDeps],
  );

  const handleRoleChange = useCallback(async (userId: string, roleKey: RoleKey) => {
    await updateBoardMemberRole(handlerDeps, userId, roleKey);
  }, [handlerDeps]);

  const onMemberRoleChange = useCallback(
    (userId: string, roleKey: RoleKey) => {
      void handleRoleChange(userId, roleKey);
    },
    [handleRoleChange],
  );

  return {
    isMobileStackedLayout,
    canAddMember,
    canRemoveMember,
    canUpdateMemberRole,
    board,
    boardLoading,
    membersNextCursor,
    directoryQuery,
    setDirectoryQuery,
    directoryUsers,
    directoryLoading,
    discardPlaceholdersOpen,
    setDiscardPlaceholdersOpen,
    discardingPlaceholders,
    addRoles,
    roleOptions,
    memberFilterQuery,
    setMemberFilterQuery,
    memberRoleFilter,
    setMemberRoleFilter,
    membersLoadingMore,
    handleDirectoryEndReached,
    filteredMemberPanelRows,
    memberRoleFilterLabel,
    memberCount,
    hasUnmappedDirectoryPlaceholders,
    handleDiscardAllPlaceholders,
    handleDirectoryRoleChange,
    handleAddUser,
    handleRemoveMember,
    onMemberRoleChange,
    fetchNextMemberPage,
    handleMemberListEndReached,
  };
}
