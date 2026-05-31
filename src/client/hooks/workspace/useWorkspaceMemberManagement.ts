import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import {
  compareUserRowsByDisplayName,
  isSearchRequestCancelled,
  MEMBER_DIRECTORY_PAGE_LIMIT,
  sortDirectoryUserRows,
} from '../../hooks/members/memberDirectoryUtils.js';
import { api } from '../../utils/api.js';
import { subscribeSocketWorkspaceUpdated } from '../../utils/socketRealtimeBridge.js';
import { builtinRoleSelectOptions } from '../../../shared/permissions/catalog.js';
import {
  memberMatchesQuery,
  workspacePayloadToMemberState,
  type UserRow,
  type WorkspaceMemberPanelRow,
  type WorkspaceMemberRow,
  type WorkspaceRoleKey,
} from '../../components/workspace/workspaceMemberTypes.js';

const BUILTIN_WORKSPACE_ROLE_OPTIONS = builtinRoleSelectOptions();

export interface UseWorkspaceMemberManagementOptions {
  readonly workspaceId: string;
  readonly canAddMembers: boolean;
  readonly canRemoveMembers: boolean;
  readonly canUpdateMemberRoles: boolean;
}

export function useWorkspaceMemberManagement({
  workspaceId,
  canAddMembers,
  canRemoveMembers,
  canUpdateMemberRoles,
}: UseWorkspaceMemberManagementOptions) {
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [owner, setOwner] = useState<UserRow | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberRow[]>([]);

  const [directoryQuery, setDirectoryQuery] = useState('');
  const [directoryUsers, setDirectoryUsers] = useState<UserRow[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryLoadingMore, setDirectoryLoadingMore] = useState(false);
  const [directoryNextCursor, setDirectoryNextCursor] = useState<string | undefined>(undefined);
  const [addRoles, setAddRoles] = useState<Record<string, WorkspaceRoleKey>>({});
  const [roleOptions, setRoleOptions] = useState<
    ReadonlyArray<{ value: WorkspaceRoleKey; label: string }>
  >(() => [...BUILTIN_WORKSPACE_ROLE_OPTIONS]);

  const [memberFilterQuery, setMemberFilterQuery] = useState('');

  const ownerIdRef = useRef<string | undefined>(undefined);
  const membersRef = useRef<WorkspaceMemberRow[]>([]);
  const directoryPagingLockRef = useRef(false);
  membersRef.current = members;

  const loadWorkspaceMembers = useCallback(
    async (opts?: { readonly quiet?: boolean }) => {
      const quiet = opts?.quiet === true;
      try {
        if (!quiet) {
          setWorkspaceLoading(true);
        }
        const response = await api.getWorkspace(workspaceId);
        const workspace = (response as { workspace: unknown }).workspace;
        const { owner: ownerRow, members: nextMembers, ownerIdStr } =
          workspacePayloadToMemberState(workspace);
        ownerIdRef.current = ownerIdStr;
        setOwner(ownerRow);
        setMembers(nextMembers);
      } catch (error) {
        console.error('Error loading workspace members:', error);
        notifications.show({
          color: 'red',
          title: 'Could not load workspace members',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        if (!quiet) {
          setWorkspaceLoading(false);
        }
      }
    },
    [workspaceId],
  );

  const loadWorkspaceMembersRef = useRef(loadWorkspaceMembers);
  loadWorkspaceMembersRef.current = loadWorkspaceMembers;
  const [directoryRefreshKey, setDirectoryRefreshKey] = useState(0);

  useEffect(() => {
    void loadWorkspaceMembers();
  }, [loadWorkspaceMembers]);

  useEffect(() => {
    return subscribeSocketWorkspaceUpdated(({ workspaceId: wid, workspace }) => {
      if (wid !== workspaceId) {
        return;
      }
      if (workspace.members !== undefined) {
        void loadWorkspaceMembersRef.current({ quiet: true });
        setDirectoryRefreshKey((k) => k + 1);
      }
    });
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    void api
      .getWorkspaceAssignableRoles(workspaceId)
      .then((r) => {
        if (cancelled) {
          return;
        }
        const roles = Array.isArray(r.roles) ? r.roles : [];
        const mapped = roles.map((role) => ({
          value: role.key as WorkspaceRoleKey,
          label: role.displayName,
        }));
        setRoleOptions(mapped.length > 0 ? mapped : [...BUILTIN_WORKSPACE_ROLE_OPTIONS]);
      })
      .catch(() => {
        if (!cancelled) {
          setRoleOptions([...BUILTIN_WORKSPACE_ROLE_OPTIONS]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      return undefined;
    }

    const controller = new AbortController();
    const q = directoryQuery.trim();

    const run = async (): Promise<void> => {
      setDirectoryLoading(true);
      setDirectoryNextCursor(undefined);
      try {
        if (q === '') {
          const response = await api.getWorkspaceMemberCandidates(workspaceId, {
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
            const next: Record<string, WorkspaceRoleKey> = { ...prev };
            for (const u of users) {
              if (next[u._id] === undefined) {
                next[u._id] = 'viewer';
              }
            }
            return next;
          });
        } else {
          const response = await api.searchUsers(q, {
            workspaceId,
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
            const next: Record<string, WorkspaceRoleKey> = {};
            for (const u of users) {
              next[u._id] = prev[u._id] ?? 'viewer';
            }
            return next;
          });
        }
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
    return () => controller.abort();
  }, [workspaceId, directoryQuery, directoryRefreshKey]);

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
    const querySnapshot = directoryQuery.trim();
    const cursorSnapshot = directoryNextCursor;

    void (async () => {
      try {
        const response =
          querySnapshot === ''
            ? await api.getWorkspaceMemberCandidates(workspaceId, {
                limit: MEMBER_DIRECTORY_PAGE_LIMIT,
                cursor: cursorSnapshot,
              })
            : await api.searchUsers(querySnapshot, {
                workspaceId,
                limit: MEMBER_DIRECTORY_PAGE_LIMIT,
                cursor: cursorSnapshot,
              });
        const users = (response.users as UserRow[]) || [];
        setDirectoryUsers((prev) => {
          const seen = new Set(prev.map((u) => u._id));
          const merged = [...prev];
          for (const u of users) {
            if (!seen.has(u._id)) {
              seen.add(u._id);
              merged.push(u);
            }
          }
          return sortDirectoryUserRows(merged);
        });
        setDirectoryNextCursor(
          response.nextCursor !== undefined && response.nextCursor !== '' ? response.nextCursor : undefined,
        );
        setAddRoles((prev) => {
          const next = { ...prev };
          for (const u of users) {
            if (next[u._id] === undefined) next[u._id] = 'viewer';
          }
          return next;
        });
      } catch (error) {
        console.error('Error loading more users:', error);
      } finally {
        directoryPagingLockRef.current = false;
        setDirectoryLoadingMore(false);
      }
    })();
  }, [directoryNextCursor, directoryLoading, directoryLoadingMore, directoryQuery, workspaceId]);

  const filteredMembers = useMemo(() => {
    if (memberFilterQuery.trim() === '') return members;
    return members.filter((m) => memberMatchesQuery(m, memberFilterQuery));
  }, [members, memberFilterQuery]);

  const memberPanelRows = useMemo((): WorkspaceMemberPanelRow[] => {
    const rows: WorkspaceMemberPanelRow[] = [];
    if (owner !== null) {
      rows.push({ kind: 'owner', user: owner });
    }
    for (const m of filteredMembers) {
      rows.push({ kind: 'member', member: m });
    }
    rows.sort((a, b) => {
      const ua = a.kind === 'owner' ? a.user : a.member.user;
      const ub = b.kind === 'owner' ? b.user : b.member.user;
      return compareUserRowsByDisplayName(ua, ub);
    });
    return rows;
  }, [owner, filteredMembers]);

  const applyWorkspaceFromMutationResponse = useCallback((workspace: unknown) => {
    const { owner: ownerRow, members: nextMembers, ownerIdStr } =
      workspacePayloadToMemberState(workspace);
    ownerIdRef.current = ownerIdStr;
    setOwner(ownerRow);
    setMembers(nextMembers);
  }, []);

  const handleAddUser = useCallback(
    async (userId: string) => {
      if (!canAddMembers) {
        return;
      }
      try {
        const roleKey = addRoles[userId] ?? 'viewer';
        const res = (await api.addWorkspaceMember(workspaceId, userId, roleKey)) as {
          workspace?: unknown;
        };
        if (res.workspace !== undefined) {
          applyWorkspaceFromMutationResponse(res.workspace);
        } else {
          void loadWorkspaceMembers({ quiet: true });
        }
        setDirectoryUsers((prev) => prev.filter((u) => u._id !== userId));
        notifications.show({
          color: 'green',
          title: 'User added',
          message: 'User has been added to the workspace.',
        });
      } catch (error) {
        console.error('Error adding workspace member:', error);
        notifications.show({
          color: 'red',
          title: 'Could not add user',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [addRoles, applyWorkspaceFromMutationResponse, canAddMembers, loadWorkspaceMembers, workspaceId],
  );

  const handleRemoveUser = useCallback(
    async (userId: string) => {
      if (!canRemoveMembers) {
        return;
      }
      try {
        const res = await api.removeWorkspaceMember(workspaceId, userId);
        if (res.workspace !== undefined) {
          applyWorkspaceFromMutationResponse(res.workspace);
        } else {
          void loadWorkspaceMembers({ quiet: true });
        }
        notifications.show({
          color: 'green',
          title: 'User removed',
          message: 'User has been removed from the workspace.',
        });
      } catch (error) {
        console.error('Error removing workspace member:', error);
        notifications.show({
          color: 'red',
          title: 'Could not remove user',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [applyWorkspaceFromMutationResponse, canRemoveMembers, loadWorkspaceMembers, workspaceId],
  );

  const handleUpdateRole = useCallback(
    async (userId: string, roleKey: WorkspaceRoleKey) => {
      if (!canUpdateMemberRoles) {
        return;
      }
      try {
        const res = (await api.updateWorkspaceMemberRole(workspaceId, userId, roleKey)) as {
          workspace?: unknown;
        };
        if (res.workspace !== undefined) {
          applyWorkspaceFromMutationResponse(res.workspace);
        } else {
          void loadWorkspaceMembers({ quiet: true });
        }
      } catch (error) {
        console.error('Error updating workspace role:', error);
        notifications.show({
          color: 'red',
          title: 'Could not update role',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [applyWorkspaceFromMutationResponse, canUpdateMemberRoles, loadWorkspaceMembers, workspaceId],
  );

  const handleDirectoryRoleChange = useCallback((userId: string, roleKey: WorkspaceRoleKey) => {
    setAddRoles((prev) => ({ ...prev, [userId]: roleKey }));
  }, []);

  return {
    workspaceLoading,
    owner,
    filteredMembers,
    directoryQuery,
    setDirectoryQuery,
    directoryUsers,
    directoryLoading,
    directoryLoadingMore,
    addRoles,
    roleOptions,
    memberFilterQuery,
    setMemberFilterQuery,
    memberPanelRows,
    ownerIdRef,
    membersRef,
    handleDirectoryEndReached,
    handleAddUser,
    handleRemoveUser,
    handleUpdateRole,
    handleDirectoryRoleChange,
  };
}
