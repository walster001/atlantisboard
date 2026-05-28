import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  memo,
  type ComponentPropsWithoutRef,
} from 'react';
import {
  Avatar,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconUserMinus } from '@tabler/icons-react';
import axios from 'axios';
import { TableVirtuoso } from 'react-virtuoso';
import { APP_USER_AVATAR_SIZE } from '../../constants/userAvatar.js';
import { api } from '../../utils/api.js';
import { subscribeSocketWorkspaceUpdated } from '../../utils/socketRealtimeBridge.js';
import { userMenuStyleAvatarInitials } from '../../utils/userMenuStyleAvatarInitials.js';
import { BoardMemberEnterToSearchField } from '../board/BoardMemberEnterToSearchField.js';
import '../board/boardMemberManagement.css';

function isSearchRequestCancelled(error: unknown): boolean {
  return axios.isCancel(error);
}

type WorkspaceRoleKey = string;

interface UserRow {
  readonly _id: string;
  readonly displayName: string;
  readonly email: string;
  readonly profilePicture?: string | undefined;
}

interface WorkspaceMemberRow {
  readonly user: UserRow;
  readonly roleKey: WorkspaceRoleKey;
}

type WorkspaceMemberPanelRow =
  | { readonly kind: 'owner'; readonly user: UserRow }
  | { readonly kind: 'member'; readonly member: WorkspaceMemberRow };

function workspaceMemberPanelRowKey(row: WorkspaceMemberPanelRow): string {
  return row.kind === 'owner' ? `owner:${row.user._id}` : row.member.user._id;
}

const BUILTIN_WORKSPACE_ROLE_OPTIONS: ReadonlyArray<{ value: WorkspaceRoleKey; label: string }> = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
] as const;

const DIRECTORY_PAGE_LIMIT = 100;
const MEMBER_ROW_PX = 96;
const ACTION_COL_PX = 118;
const ROLE_COL_PX = 148;

/** Stable for TableVirtuoso `components` — inline objects remount the table every render and glitch on data changes. */
const WorkspaceMemberDataTable = forwardRef<HTMLTableElement, ComponentPropsWithoutRef<'table'>>(
  ({ style, className, children, ...props }, ref) => (
    <table
      ref={ref}
      {...props}
      className={['board-member-management__data-table', className].filter(Boolean).join(' ')}
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        ...style,
      }}
    >
      <colgroup>
        <col />
        <col style={{ width: ROLE_COL_PX }} />
        <col style={{ width: ACTION_COL_PX }} />
      </colgroup>
      {children}
    </table>
  ),
);
WorkspaceMemberDataTable.displayName = 'WorkspaceMemberDataTable';

const WorkspaceMemberTableRow = forwardRef<HTMLTableRowElement, ComponentPropsWithoutRef<'tr'>>(
  ({ style, ...rest }, ref) => (
    <tr
      {...rest}
      ref={ref}
      style={{
        ...style,
        height: MEMBER_ROW_PX,
        boxSizing: 'border-box',
      }}
    />
  ),
);
WorkspaceMemberTableRow.displayName = 'WorkspaceMemberTableRow';

const workspaceMemberTableVirtuosoComponents = {
  Table: WorkspaceMemberDataTable,
  TableRow: WorkspaceMemberTableRow,
} as const;

const WORKSPACE_MEMBER_VIRTUOSO_VIEWPORT_PAD = { top: 80, bottom: 120 } as const;
const WORKSPACE_MEMBER_DIRECTORY_OVERSCAN = 8;
const WORKSPACE_MEMBER_LIST_OVERSCAN = 14;

function compareUserRowsByDisplayName(a: UserRow, b: UserRow): number {
  const byName = a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
  if (byName !== 0) return byName;
  return a.email.localeCompare(b.email, undefined, { sensitivity: 'base' });
}

function sortUsers(users: readonly UserRow[]): UserRow[] {
  return [...users].sort(compareUserRowsByDisplayName);
}

function normalizeString(value: string): string {
  return value.trim().toLowerCase();
}

function memberMatchesQuery(member: WorkspaceMemberRow, query: string): boolean {
  const q = normalizeString(query);
  if (q === '') return true;
  return (
    normalizeString(member.user.displayName).includes(q) ||
    normalizeString(member.user.email).includes(q)
  );
}

function canAddUserById(existing: readonly WorkspaceMemberRow[], ownerId: string | undefined, userId: string): boolean {
  if (ownerId !== undefined && ownerId === userId) return false;
  return !existing.some((m) => m.user._id === userId);
}

function workspacePayloadToMemberState(workspace: unknown): {
  owner: UserRow | null;
  members: WorkspaceMemberRow[];
  ownerIdStr: string | undefined;
} {
  const w = workspace as {
    ownerId?: string | UserRow;
    members?: Array<{ userId: string | UserRow; roleKey: WorkspaceRoleKey }>;
  };
  const ownerRaw = w.ownerId;
  const ownerRow: UserRow | null =
    typeof ownerRaw === 'string'
      ? { _id: ownerRaw, displayName: '', email: '' }
      : ownerRaw !== undefined
        ? ownerRaw
        : null;
  const ownerIdStr = ownerRow?._id;
  const byMemberId = new Map<string, WorkspaceMemberRow>();
  for (const m of w.members ?? []) {
    const user: UserRow =
      typeof m.userId === 'string' ? { _id: m.userId, displayName: '', email: '' } : m.userId;
    if (ownerIdStr !== undefined && user._id === ownerIdStr) {
      continue;
    }
    byMemberId.set(user._id, { user, roleKey: m.roleKey });
  }
  const nextMembers = [...byMemberId.values()].sort((a, b) =>
    compareUserRowsByDisplayName(a.user, b.user),
  );
  return { owner: ownerRow, members: nextMembers, ownerIdStr };
}

const WorkspaceMemberPanelOwnerCells = memo(function WorkspaceMemberPanelOwnerCells(props: {
  readonly user: UserRow;
}) {
  const { user } = props;
  return (
    <>
      <td className="board-member-management__td board-member-management__td--user board-member-management__td--user-row-owner">
        <Group gap="sm" wrap="nowrap" align="center">
          <Avatar
            size={APP_USER_AVATAR_SIZE}
            color="blue"
            {...(user.profilePicture != null && user.profilePicture !== '' ? { src: user.profilePicture } : {})}
          >
            {userMenuStyleAvatarInitials(user.displayName, user.email)}
          </Avatar>
          <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600} size="sm" lineClamp={1}>
              {user.displayName}
            </Text>
            <Tooltip
              label={user.email}
              disabled={user.email.trim() === ''}
              openDelay={350}
              position="top-start"
            >
              <Text
                component="span"
                size="xs"
                c="dimmed"
                lineClamp={2}
                className="board-member-management__email-text"
              >
                {user.email}
              </Text>
            </Tooltip>
          </Stack>
        </Group>
      </td>
      <td className="board-member-management__td board-member-management__td--role board-member-management__td--role-owner">
        <Text component="span" size="sm" fw={500} c="dimmed" style={{ lineHeight: 1.45 }}>
          Owner
        </Text>
      </td>
      <td className="board-member-management__td board-member-management__td--action board-member-management__td--action-row-owner" />
    </>
  );
});
WorkspaceMemberPanelOwnerCells.displayName = 'WorkspaceMemberPanelOwnerCells';

const WorkspaceMemberPanelMemberCells = memo(function WorkspaceMemberPanelMemberCells(props: {
  readonly member: WorkspaceMemberRow;
  readonly roleOptions: ReadonlyArray<{ value: WorkspaceRoleKey; label: string }>;
  readonly canRemoveMembers: boolean;
  readonly canUpdateMemberRoles: boolean;
  readonly onRoleChange: (userId: string, roleKey: WorkspaceRoleKey) => void;
  readonly onRemove: (userId: string) => void;
}) {
  const { member, roleOptions, canRemoveMembers, canUpdateMemberRoles, onRoleChange, onRemove } = props;
  const user = member.user;
  return (
    <>
      <td className="board-member-management__td board-member-management__td--user">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <Avatar
            size={APP_USER_AVATAR_SIZE}
            color="gray"
            mt={2}
            {...(user.profilePicture != null && user.profilePicture !== '' ? { src: user.profilePicture } : {})}
          >
            {userMenuStyleAvatarInitials(user.displayName, user.email)}
          </Avatar>
          <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600} size="sm" lineClamp={1}>
              {user.displayName}
            </Text>
            <Tooltip
              label={user.email}
              disabled={user.email.trim() === ''}
              openDelay={350}
              position="top-start"
              multiline
              maw={420}
            >
              <Text
                component="span"
                size="xs"
                c="dimmed"
                lineClamp={2}
                className="board-member-management__email-text"
              >
                {user.email}
              </Text>
            </Tooltip>
          </Stack>
        </Group>
      </td>
      <td className="board-member-management__td board-member-management__td--role">
        {canUpdateMemberRoles ? (
          <Select
            size="xs"
            w="100%"
            value={member.roleKey}
            onChange={(v) => {
              if (!v) return;
              onRoleChange(user._id, v as WorkspaceRoleKey);
            }}
            data={roleOptions}
            comboboxProps={{ withinPortal: false }}
          />
        ) : (
          <Text size="sm" c="dimmed" ta="center">
            -
          </Text>
        )}
      </td>
      <td className="board-member-management__td board-member-management__td--action">
        {canRemoveMembers ? (
          <Button
            size="xs"
            variant="subtle"
            color="red"
            leftSection={<IconUserMinus size={16} stroke={1.5} />}
            onClick={() => {
              onRemove(user._id);
            }}
          >
            Remove
          </Button>
        ) : (
          <Text size="sm" c="dimmed" ta="center">
            -
          </Text>
        )}
      </td>
    </>
  );
});
WorkspaceMemberPanelMemberCells.displayName = 'WorkspaceMemberPanelMemberCells';

interface WorkspaceMemberManagementProps {
  readonly workspaceId: string;
  readonly canAddMembers?: boolean;
  readonly canRemoveMembers?: boolean;
  readonly canUpdateMemberRoles?: boolean;
}

export function WorkspaceMemberManagement({
  workspaceId,
  canAddMembers = true,
  canRemoveMembers = true,
  canUpdateMemberRoles = true,
}: WorkspaceMemberManagementProps) {
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [owner, setOwner] = useState<UserRow | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberRow[]>([]);

  /** Directory: committed query only after Enter. */
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [directoryUsers, setDirectoryUsers] = useState<UserRow[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryLoadingMore, setDirectoryLoadingMore] = useState(false);
  const [directoryNextCursor, setDirectoryNextCursor] = useState<string | undefined>(undefined);
  const [addRoles, setAddRoles] = useState<Record<string, WorkspaceRoleKey>>({});
  const [roleOptions, setRoleOptions] = useState<
    ReadonlyArray<{ value: WorkspaceRoleKey; label: string }>
  >(() => [...BUILTIN_WORKSPACE_ROLE_OPTIONS]);

  /** Members: filter applied only after Enter. */
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
            limit: DIRECTORY_PAGE_LIMIT,
            signal: controller.signal,
          });
          if (controller.signal.aborted) {
            return;
          }
          const users = (response.users as UserRow[]) || [];
          setDirectoryUsers(sortUsers(users));
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
            limit: DIRECTORY_PAGE_LIMIT,
            signal: controller.signal,
          });
          if (controller.signal.aborted) {
            return;
          }
          const users = (response.users as UserRow[]) || [];
          setDirectoryUsers(sortUsers(users));
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
                limit: DIRECTORY_PAGE_LIMIT,
                cursor: cursorSnapshot,
              })
            : await api.searchUsers(querySnapshot, {
                workspaceId,
                limit: DIRECTORY_PAGE_LIMIT,
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
          return sortUsers(merged);
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

  /** Owner + members, sorted like board settings (display name) for stable Virtuoso keys at large counts. */
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

  if (workspaceLoading) {
    return (
      <Box ta="center" py="md" style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size="sm" />
      </Box>
    );
  }

  return (
    <Group
      align="stretch"
      gap="lg"
      wrap="nowrap"
      style={{
        width: '100%',
        flex: 1,
        minHeight: 0,
        alignSelf: 'stretch',
      }}
    >
      <Paper
        withBorder
        p="md"
        radius="md"
        style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <Group justify="space-between" align="center" mb="xs" wrap="nowrap">
          <Text fw={600}>All Users</Text>
        </Group>
        <BoardMemberEnterToSearchField
          ariaLabel="Search all users"
          placeholder="Search users to add..."
          onCommit={(trimmed) => setDirectoryQuery(trimmed)}
        />
        <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden', marginTop: 12 }}>
          {directoryLoading ? (
            <Box ta="center" py="md">
              <Loader size="sm" />
            </Box>
          ) : (
            directoryUsers.length === 0 ? (
              <Box ta="center" py="md">
                <Text size="sm" c="dimmed">
                  {directoryQuery.trim() === ''
                    ? 'No users available to add.'
                    : 'No users match your search.'}
                </Text>
              </Box>
            ) : (
            <TableVirtuoso
              style={{ height: '100%' }}
              data={directoryUsers}
              components={workspaceMemberTableVirtuosoComponents}
              computeItemKey={(_index, user) => user._id}
              fixedItemHeight={MEMBER_ROW_PX}
              increaseViewportBy={WORKSPACE_MEMBER_VIRTUOSO_VIEWPORT_PAD}
              overscan={WORKSPACE_MEMBER_DIRECTORY_OVERSCAN}
              endReached={handleDirectoryEndReached}
              itemContent={(_index, user) => {
                const role = addRoles[user._id] ?? 'viewer';
                const canAdd = canAddUserById(membersRef.current, ownerIdRef.current, user._id);
                return (
                  <>
                    <td className="board-member-management__td board-member-management__td--user">
                      <Group gap="sm" wrap="nowrap" align="flex-start">
                        <Avatar
                          size={APP_USER_AVATAR_SIZE}
                          color="gray"
                          mt={2}
                          {...(user.profilePicture != null && user.profilePicture !== '' ? { src: user.profilePicture } : {})}
                        >
                          {userMenuStyleAvatarInitials(user.displayName, user.email)}
                        </Avatar>
                        <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                          <Text fw={600} size="sm" lineClamp={1}>
                            {user.displayName}
                          </Text>
                          <Tooltip
                            label={user.email}
                            disabled={user.email.trim() === ''}
                            openDelay={350}
                            position="top-start"
                            multiline
                            maw={420}
                          >
                            <Text
                              component="span"
                              size="xs"
                              c="dimmed"
                              lineClamp={2}
                              className="board-member-management__email-text"
                            >
                              {user.email}
                            </Text>
                          </Tooltip>
                        </Stack>
                      </Group>
                    </td>
                    <td className="board-member-management__td board-member-management__td--role">
                      {canUpdateMemberRoles ? (
                        <Select
                          size="xs"
                          w="100%"
                          value={role}
                          onChange={(v) => {
                            if (!v) return;
                            setAddRoles((prev) => ({ ...prev, [user._id]: v as WorkspaceRoleKey }));
                          }}
                          data={roleOptions}
                          comboboxProps={{ withinPortal: false }}
                        />
                      ) : (
                        <Text size="sm" c="dimmed" ta="center">
                          -
                        </Text>
                      )}
                    </td>
                    <td className="board-member-management__td board-member-management__td--action">
                      {canAddMembers ? (
                        <Button
                          size="xs"
                          color="blue"
                          leftSection={<IconPlus size={14} stroke={2} />}
                          disabled={!canAdd}
                          onClick={() => {
                            void handleAddUser(user._id);
                          }}
                        >
                          Add
                        </Button>
                      ) : (
                        <Text size="sm" c="dimmed" ta="center">
                          -
                        </Text>
                      )}
                    </td>
                  </>
                );
              }}
            />
            )
          )}
          {directoryLoadingMore ? (
            <Box ta="center" py="xs">
              <Loader size="xs" />
            </Box>
          ) : null}
        </Box>
      </Paper>

      <Paper
        withBorder
        p="md"
        radius="md"
        style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <Group justify="space-between" align="center" mb="xs" wrap="nowrap">
          <Text fw={600}>Current Members</Text>
        </Group>
        <BoardMemberEnterToSearchField
          ariaLabel="Search workspace members"
          placeholder="Search members..."
          onCommit={(trimmed) => setMemberFilterQuery(trimmed)}
        />
        <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden', marginTop: 12 }}>
          {owner === null && filteredMembers.length === 0 ? (
            <Box ta="center" py="md">
              <Text size="sm" c="dimmed">
                No members yet.
              </Text>
            </Box>
          ) : (
            <TableVirtuoso
              style={{ height: '100%' }}
              data={memberPanelRows}
              components={workspaceMemberTableVirtuosoComponents}
              computeItemKey={(_index, row) => workspaceMemberPanelRowKey(row)}
              fixedItemHeight={MEMBER_ROW_PX}
              increaseViewportBy={WORKSPACE_MEMBER_VIRTUOSO_VIEWPORT_PAD}
              overscan={WORKSPACE_MEMBER_LIST_OVERSCAN}
              itemContent={(_index, row) =>
                row.kind === 'owner' ? (
                  <WorkspaceMemberPanelOwnerCells user={row.user} />
                ) : (
                  <WorkspaceMemberPanelMemberCells
                    member={row.member}
                    roleOptions={roleOptions}
                    canRemoveMembers={canRemoveMembers}
                    canUpdateMemberRoles={canUpdateMemberRoles}
                    onRoleChange={handleUpdateRole}
                    onRemove={handleRemoveUser}
                  />
                )
              }
            />
          )}
        </Box>
      </Paper>
    </Group>
  );
}

