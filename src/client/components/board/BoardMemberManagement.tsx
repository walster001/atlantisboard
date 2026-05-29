import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactElement,
} from 'react';
import {
  Avatar,
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Menu,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconFilter, IconPlus, IconUserMinus, IconX } from '@tabler/icons-react';
import { TableVirtuoso } from 'react-virtuoso';
import axios from 'axios';
import { APP_USER_AVATAR_SIZE } from '../../constants/userAvatar.js';
import { api } from '../../utils/api.js';
import { subscribeSocketBoardUpdated } from '../../utils/socketRealtimeBridge.js';
import { userMenuStyleAvatarInitials } from '../../utils/userMenuStyleAvatarInitials.js';
import { BoardMemberEnterToSearchField } from './BoardMemberEnterToSearchField.js';
import { useBoardPermissions } from '../../hooks/useBoardPermissions.js';
import { useResponsiveTier } from '../../hooks/useResponsiveTier.js';
import './boardMemberManagement.css';

function isSearchRequestCancelled(error: unknown): boolean {
  return axios.isCancel(error);
}

type RoleKey = 'admin' | 'manager' | 'viewer' | `custom:${string}`;

interface UserRow {
  _id: string;
  displayName: string;
  email: string;
  profilePicture?: string | undefined;
  importPlaceholder?: boolean | undefined;
  importNotMapped?: boolean | undefined;
}

interface BoardMember {
  userId: string | UserRow;
  roleKey: RoleKey;
}

interface BoardPayload {
  ownerId?: string | UserRow;
  members?: BoardMember[];
}

interface BoardMemberListItem {
  userId: string;
  displayName: string;
  email: string;
  profilePicture?: string;
  role: 'owner' | 'member';
  roleKey: string;
  importPlaceholder?: boolean | undefined;
  importNotMapped?: boolean | undefined;
}

function extractUser(userId: string | UserRow): UserRow {
  if (typeof userId === 'string') {
    return { _id: userId, displayName: '', email: '' };
  }
  return userId;
}

function compareUserRowsByDisplayName(a: UserRow, b: UserRow): number {
  const byName = a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
  if (byName !== 0) {
    return byName;
  }
  return a.email.localeCompare(b.email, undefined, { sensitivity: 'base' });
}

function sortDirectoryUserRows(users: readonly UserRow[]): UserRow[] {
  return [...users].sort(compareUserRowsByDisplayName);
}

function sortBoardMembersByDisplayName(members: readonly BoardMember[]): BoardMember[] {
  return [...members].sort((m1, m2) =>
    compareUserRowsByDisplayName(extractUser(m1.userId), extractUser(m2.userId)),
  );
}

function memberPanelRowMatchesRoleFilter(row: MemberPanelRow, roleFilter: RoleKey): boolean {
  if (row.kind === 'owner') {
    return roleFilter === 'admin';
  }
  return row.member.roleKey === roleFilter;
}

/** Later entries win (newest page / API wins) so pagination merges stay consistent */
function mergeBoardMembersByUserId(
  existing: readonly BoardMember[],
  incoming: readonly BoardMember[],
): BoardMember[] {
  const map = new Map<string, BoardMember>();
  for (const m of existing) {
    map.set(extractUser(m.userId)._id, m);
  }
  for (const m of incoming) {
    map.set(extractUser(m.userId)._id, m);
  }
  return [...map.values()];
}

type MemberPanelRow =
  | { readonly kind: 'owner'; readonly user: UserRow }
  | { readonly kind: 'member'; readonly member: BoardMember };

const BUILTIN_ROLE_OPTIONS: { value: RoleKey; label: string }[] = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
] as const;

/** Must match `fixedItemHeight` on TableVirtuoso (room for 2-line email + name). */
const BOARD_MEMBER_TABLE_ROW_PX = 96;
/** Fixed columns keep role + action aligned while virtual rows mount/unmount. */
const BOARD_MEMBER_ACTION_COL_PX = 118;
const BOARD_MEMBER_ROLE_COL_PX = 148;

/** Stable for TableVirtuoso `components` (avoid remount on parent render). */
const BoardMemberDataTable = forwardRef<HTMLTableElement, ComponentPropsWithoutRef<'table'>>(
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
        <col style={{ width: BOARD_MEMBER_ROLE_COL_PX }} />
        <col style={{ width: BOARD_MEMBER_ACTION_COL_PX }} />
      </colgroup>
      {children}
    </table>
  ),
);
BoardMemberDataTable.displayName = 'BoardMemberDataTable';
const DIRECTORY_PAGE_LIMIT = 100;
/** Server `boardMembersQuerySchema` / `getBoardMembersPage` cap — use full page for fewer round-trips at ~1000 members. */
const BOARD_MEMBERS_LIST_PAGE_LIMIT = 200;

/** Fixed height matches `fixedItemHeight`; avoids Virtuoso scroll drift from border/padding. */
const BoardMemberTableRow = forwardRef<HTMLTableRowElement, ComponentPropsWithoutRef<'tr'>>(
  ({ style, ...rest }, ref) => (
    <tr
      {...rest}
      ref={ref}
      style={{
        ...style,
        height: BOARD_MEMBER_TABLE_ROW_PX,
        boxSizing: 'border-box',
      }}
    />
  ),
);
BoardMemberTableRow.displayName = 'BoardMemberTableRow';

const boardMemberTableVirtuosoComponents = {
  Table: BoardMemberDataTable,
  TableRow: BoardMemberTableRow,
};

/** Tighter avatar in board settings mobile stacked layout (frees width for name/email). */
const BOARD_MEMBER_MOBILE_AVATAR_PX = 32;

function ImportPlaceholderBadges(props: {
  readonly importPlaceholder?: boolean | undefined;
  readonly importNotMapped?: boolean | undefined;
}): ReactElement | null {
  if (props.importPlaceholder !== true) {
    return null;
  }
  return (
    <Group gap={4} wrap="wrap">
      <Badge size="xs" variant="light" color="grape">
        Imported
      </Badge>
      {props.importNotMapped === true ? (
        <Badge size="xs" variant="light" color="orange">
          Not Mapped
        </Badge>
      ) : null}
    </Group>
  );
}

const BoardMemberUserIdentityStack = memo(function BoardMemberUserIdentityStack(props: {
  readonly user: UserRow;
  readonly compact?: boolean;
}) {
  const { user, compact = false } = props;
  const email = user.email.trim();
  const emailLine =
    email !== '' ? email : user.importPlaceholder === true ? 'No email in import file' : '';
  return (
    <Stack gap={compact ? 2 : 4} style={{ flex: 1, minWidth: 0 }}>
      <Group gap={6} wrap="wrap" align="center">
        <Text fw={600} size={compact ? 'xs' : 'sm'} lineClamp={compact ? 2 : 1} style={{ flex: 1, minWidth: 0 }}>
          {user.displayName}
        </Text>
        <ImportPlaceholderBadges
          importPlaceholder={user.importPlaceholder}
          importNotMapped={user.importNotMapped}
        />
      </Group>
      <Tooltip label={emailLine} disabled={emailLine === ''} openDelay={350} position="top-start" multiline maw={420}>
        <Text
          component="span"
          size="xs"
          c="dimmed"
          lineClamp={compact ? 3 : 2}
          className="board-member-management__email-text"
        >
          {emailLine}
        </Text>
      </Tooltip>
    </Stack>
  );
});

/** Less DOM churn than large overscan; keeps scroll smooth on long lists. */
const BOARD_MEMBER_VIRTUOSO_VIEWPORT_PAD = { top: 80, bottom: 120 } as const;
const BOARD_MEMBER_VIRTUOSO_OVERSCAN = 6;
/** Wider window for current-members list when hundreds of rows are loaded. */
const BOARD_MEMBER_CURRENT_LIST_OVERSCAN = 14;

const DirectoryUserTableRow = memo(function DirectoryUserTableRow(props: {
  readonly user: UserRow;
  readonly roleKey: RoleKey;
  readonly roleOptions: ReadonlyArray<{ value: RoleKey; label: string }>;
  readonly canAddMember: boolean;
  readonly canUpdateMemberRole: boolean;
  readonly onRoleChange: (userId: string, next: RoleKey) => void;
  readonly onAddUser: (userId: string) => void;
  readonly compactLayout?: boolean;
}) {
  const {
    user,
    roleKey,
    roleOptions,
    canAddMember,
    canUpdateMemberRole,
    onRoleChange,
    onAddUser,
    compactLayout = false,
  } = props;
  const avatarSize = compactLayout ? BOARD_MEMBER_MOBILE_AVATAR_PX : APP_USER_AVATAR_SIZE;
  const isImportPlaceholder = user.importPlaceholder === true;
  return (
    <>
      <td className="board-member-management__td board-member-management__td--user">
        <Group gap={compactLayout ? 6 : 'sm'} wrap="nowrap" align="flex-start">
          <Avatar
            size={avatarSize}
            color="gray"
            mt={2}
            {...(user.profilePicture != null && user.profilePicture !== '' ? { src: user.profilePicture } : {})}
          >
            {userMenuStyleAvatarInitials(user.displayName, user.email)}
          </Avatar>
          <BoardMemberUserIdentityStack user={user} compact={compactLayout} />
        </Group>
      </td>
      <td className="board-member-management__td board-member-management__td--role">
        {canUpdateMemberRole ? (
          <Select
            size="xs"
            w="100%"
            value={roleKey}
            onChange={(v) => {
              if (v) {
                onRoleChange(user._id, v as RoleKey);
              }
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
        {isImportPlaceholder ? (
          <Text size="xs" c="dimmed" ta="center">
            On board
          </Text>
        ) : canAddMember ? (
          compactLayout ? (
            <Tooltip label="Add to board">
              <ActionIcon
                size="lg"
                radius="md"
                color="blue"
                variant="light"
                aria-label="Add user to board"
                onClick={() => {
                  onAddUser(user._id);
                }}
              >
                <IconPlus size={18} stroke={2} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <Button
              size="xs"
              color="blue"
              leftSection={<IconPlus size={14} stroke={2} />}
              onClick={() => {
                onAddUser(user._id);
              }}
            >
              Add
            </Button>
          )
        ) : (
          <Text size="sm" c="dimmed" ta="center">
            -
          </Text>
        )}
      </td>
    </>
  );
});

const OwnerTableCells = memo(function OwnerTableCells(props: {
  readonly user: UserRow;
  readonly compactLayout?: boolean;
}) {
  const { user, compactLayout = false } = props;
  const avatarSize = compactLayout ? BOARD_MEMBER_MOBILE_AVATAR_PX : APP_USER_AVATAR_SIZE;
  return (
    <>
      <td className="board-member-management__td board-member-management__td--user board-member-management__td--user-row-owner">
        <Group gap={compactLayout ? 6 : 'sm'} wrap="nowrap" align="center">
          <Avatar
            size={avatarSize}
            color="blue"
            {...(user.profilePicture != null && user.profilePicture !== '' ? { src: user.profilePicture } : {})}
          >
            {userMenuStyleAvatarInitials(user.displayName, user.email)}
          </Avatar>
          <BoardMemberUserIdentityStack user={user} compact={compactLayout} />
        </Group>
      </td>
      <td
        className="board-member-management__td board-member-management__td--role board-member-management__td--role-owner"
      >
        <Text component="span" size="sm" fw={500} c="dimmed" style={{ lineHeight: 1.45 }}>
          Owner
        </Text>
      </td>
      <td className="board-member-management__td board-member-management__td--action board-member-management__td--action-row-owner" />
    </>
  );
});

const MemberTableCells = memo(function MemberTableCells(props: {
  readonly user: UserRow;
  readonly roleKey: RoleKey;
  readonly roleOptions: ReadonlyArray<{ value: RoleKey; label: string }>;
  readonly canRemoveMember: boolean;
  readonly canUpdateMemberRole: boolean;
  readonly onRoleChange: (userId: string, next: RoleKey) => void;
  readonly onRemoveMember: (userId: string) => void;
  readonly compactLayout?: boolean;
}) {
  const {
    user,
    roleKey,
    roleOptions,
    canRemoveMember,
    canUpdateMemberRole,
    onRoleChange,
    onRemoveMember,
    compactLayout = false,
  } = props;
  const avatarSize = compactLayout ? BOARD_MEMBER_MOBILE_AVATAR_PX : APP_USER_AVATAR_SIZE;
  return (
    <>
      <td className="board-member-management__td board-member-management__td--user">
        <Group gap={compactLayout ? 6 : 'sm'} wrap="nowrap" align="flex-start">
          <Avatar
            size={avatarSize}
            color="gray"
            mt={2}
            {...(user.profilePicture != null && user.profilePicture !== '' ? { src: user.profilePicture } : {})}
          >
            {userMenuStyleAvatarInitials(user.displayName, user.email)}
          </Avatar>
          <BoardMemberUserIdentityStack user={user} compact={compactLayout} />
        </Group>
      </td>
      <td className="board-member-management__td board-member-management__td--role">
        {canUpdateMemberRole ? (
          <Select
            size="xs"
            w="100%"
            value={roleKey}
            onChange={(v) => {
              if (v) {
                onRoleChange(user._id, v as RoleKey);
              }
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
        {canRemoveMember ? (
          compactLayout ? (
            <Tooltip label="Remove from board">
              <ActionIcon
                size="lg"
                radius="md"
                color="red"
                variant="light"
                aria-label="Remove member from board"
                onClick={() => {
                  onRemoveMember(user._id);
                }}
              >
                <IconUserMinus size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <Button
              size="xs"
              variant="subtle"
              color="red"
              leftSection={<IconUserMinus size={16} stroke={1.5} />}
              onClick={() => {
                onRemoveMember(user._id);
              }}
            >
              Remove
            </Button>
          )
        ) : (
          <Text size="sm" c="dimmed" ta="center">
            -
          </Text>
        )}
      </td>
    </>
  );
});

interface BoardMemberManagementProps {
  boardId: string;
}

export function BoardMemberManagement({ boardId }: BoardMemberManagementProps) {
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
  /** Committed query: API runs only after Enter (or initial mount). */
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [directoryUsers, setDirectoryUsers] = useState<UserRow[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryLoadingMore, setDirectoryLoadingMore] = useState(false);
  const [discardPlaceholdersOpen, setDiscardPlaceholdersOpen] = useState(false);
  const [discardingPlaceholders, setDiscardingPlaceholders] = useState(false);
  const [directoryNextCursor, setDirectoryNextCursor] = useState<string | undefined>(undefined);
  const [addRoles, setAddRoles] = useState<Record<string, RoleKey>>({});
  const [roleOptions, setRoleOptions] = useState<Array<{ value: RoleKey; label: string }>>(
    () => [...BUILTIN_ROLE_OPTIONS],
  );
  /** Committed filter: applied only after Enter (initial '' shows everyone). */
  const [memberFilterQuery, setMemberFilterQuery] = useState('');
  const [memberRoleFilter, setMemberRoleFilter] = useState<RoleKey | null>(null);
  const [membersLoadingMore, setMembersLoadingMore] = useState(false);

  const addRolesRef = useRef(addRoles);
  const directoryUsersRef = useRef(directoryUsers);
  const directoryQueryRef = useRef(directoryQuery);
  const boardIdRef = useRef(boardId);
  const directoryPagingLockRef = useRef(false);
  const membersPagingLockRef = useRef(false);
  addRolesRef.current = addRoles;
  directoryUsersRef.current = directoryUsers;
  directoryQueryRef.current = directoryQuery;
  boardIdRef.current = boardId;

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
      const ownerRow = rows.find((row) => row.role === 'owner');
      const memberRows = rows.filter((row) => row.role !== 'owner');
      const next: BoardPayload = {
        ...(ownerRow !== undefined
          ? {
              ownerId: {
                _id: ownerRow.userId,
                displayName: ownerRow.displayName,
                email: ownerRow.email,
                ...(ownerRow.profilePicture !== undefined
                  ? { profilePicture: ownerRow.profilePicture }
                  : {}),
                ...(ownerRow.importPlaceholder === true
                  ? { importPlaceholder: true, importNotMapped: ownerRow.importNotMapped === true }
                  : {}),
              },
            }
          : {}),
        members: memberRows.map((row) => ({
          userId: {
            _id: row.userId,
            displayName: row.displayName,
            email: row.email,
            ...(row.profilePicture !== undefined ? { profilePicture: row.profilePicture } : {}),
            ...(row.importPlaceholder === true
              ? { importPlaceholder: true, importNotMapped: row.importNotMapped === true }
              : {}),
          },
          roleKey: row.roleKey as RoleKey,
        })),
      };
      setBoard((prev) => {
        if (cursor === undefined || prev === null) {
          return next;
        }
        const ownerId =
          next.ownerId !== undefined ? next.ownerId : prev.ownerId;
        return {
          ...(ownerId !== undefined ? { ownerId } : {}),
          members: sortBoardMembersByDisplayName(
            mergeBoardMembersByUserId(prev.members ?? [], next.members ?? []),
          ),
        };
      });
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
  const [directoryRefreshKey, setDirectoryRefreshKey] = useState(0);

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

  useEffect(() => {
    setMemberRoleFilter(null);
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
          limit: DIRECTORY_PAGE_LIMIT,
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
    const querySnapshot = directoryQuery;
    const boardIdSnapshot = boardId;
    const cursorSnapshot = directoryNextCursor;
    void (async () => {
      try {
        const response = await api.searchUsers(querySnapshot, {
          boardId: boardIdSnapshot,
          limit: DIRECTORY_PAGE_LIMIT,
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
  }, [
    boardId,
    directoryQuery,
    directoryLoading,
    directoryLoadingMore,
    directoryNextCursor,
  ]);

  const boardRef = useRef(board);
  boardRef.current = board;

  const owner = board?.ownerId ? extractUser(board.ownerId) : null;

  const sortedMemberPanelRows = useMemo((): MemberPanelRow[] => {
    const members = board?.members ?? [];
    const rows: MemberPanelRow[] = [];
    if (owner !== null && owner.importPlaceholder !== true) {
      rows.push({ kind: 'owner', user: owner });
    }
    for (const m of members) {
      const memberUser = extractUser(m.userId);
      if (memberUser.importPlaceholder === true) {
        continue;
      }
      rows.push({ kind: 'member', member: m });
    }
    rows.sort((a, b) => {
      const ua = a.kind === 'owner' ? a.user : extractUser(a.member.userId);
      const ub = b.kind === 'owner' ? b.user : extractUser(b.member.userId);
      return compareUserRowsByDisplayName(ua, ub);
    });
    return rows;
  }, [board?.members, owner]);

  const filteredMemberPanelRows = useMemo((): MemberPanelRow[] => {
    if (memberRoleFilter == null) {
      return sortedMemberPanelRows;
    }
    return sortedMemberPanelRows.filter((row) => memberPanelRowMatchesRoleFilter(row, memberRoleFilter));
  }, [sortedMemberPanelRows, memberRoleFilter]);

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

  const handleDiscardAllPlaceholders = useCallback(async (): Promise<void> => {
    if (!canRemoveMember) {
      return;
    }
    setDiscardingPlaceholders(true);
    try {
      const result = await api.discardBoardImportPlaceholders(boardId);
      setDiscardPlaceholdersOpen(false);
      setDirectoryUsers((prev) => prev.filter((u) => u.importPlaceholder !== true));
      setBoard((prev) => {
        if (prev === null) {
          return prev;
        }
        return {
          ...prev,
          members: (prev.members ?? []).filter((m) => {
            const u = extractUser(m.userId);
            return u.importPlaceholder !== true;
          }),
        };
      });
      void loadBoard();
      notifications.show({
        color: 'green',
        title: 'Placeholders discarded',
        message:
          result.removedCount > 0
            ? `Removed ${result.removedCount} placeholder user${result.removedCount === 1 ? '' : 's'} from this board.`
            : 'No placeholder users were removed.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Could not discard placeholders',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setDiscardingPlaceholders(false);
    }
  }, [boardId, canRemoveMember, loadBoard]);

  const handleDirectoryRoleChange = useCallback((userId: string, roleKey: RoleKey) => {
    if (!canUpdateMemberRole) {
      return;
    }
    setAddRoles((prev) => ({ ...prev, [userId]: roleKey }));
  }, [canUpdateMemberRole]);

  const handleAddUser = useCallback(
    async (userId: string) => {
      if (!canAddMember) {
        return;
      }
      const roleKey = addRolesRef.current[userId] ?? 'viewer';
      const row = directoryUsersRef.current.find((u) => u._id === userId);
      if (row === undefined) {
        return;
      }
      const userSnapshot = row;

      setDirectoryUsers((prev) => prev.filter((u) => u._id !== userId));

      setBoard((prev) => {
        if (prev === null) {
          return prev;
        }
        if ((prev.members ?? []).some((m) => extractUser(m.userId)._id === userId)) {
          return prev;
        }
        return {
          ...prev,
          members: sortBoardMembersByDisplayName([
            ...(prev.members ?? []),
            { userId: userSnapshot, roleKey },
          ]),
        };
      });

      try {
        await api.addBoardMember(boardId, userId, roleKey);
        notifications.show({
          color: 'green',
          title: 'Member added',
          message: 'User was added to this board.',
        });
      } catch (error) {
        setBoard((prev) => {
          if (prev === null) {
            return prev;
          }
          return {
            ...prev,
            members: (prev.members ?? []).filter((m) => extractUser(m.userId)._id !== userId),
          };
        });
        setDirectoryUsers((prev) => {
          if (prev.some((u) => u._id === userId)) {
            return prev;
          }
          return sortDirectoryUserRows([...prev, userSnapshot]);
        });
        notifications.show({
          color: 'red',
          title: 'Could not add member',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [boardId, canAddMember]
  );

  const handleRemoveMember = useCallback(
    (userId: string) => {
      if (!canRemoveMember) {
        return;
      }
      const snapshot = boardRef.current;
      const found = snapshot?.members?.find((m) => extractUser(m.userId)._id === userId);
      if (found === undefined) {
        return;
      }
      const removedUserRow = extractUser(found.userId);

      setBoard((prev) => {
        if (prev === null || prev.members === undefined) {
          return prev;
        }
        return {
          ...prev,
          members: prev.members.filter((m) => extractUser(m.userId)._id !== userId),
        };
      });

      setDirectoryUsers((prev) => {
        if (prev.some((u) => u._id === userId)) {
          return prev;
        }
        return sortDirectoryUserRows([removedUserRow, ...prev]);
      });

      void (async () => {
        try {
          await api.removeBoardMember(boardId, userId);
          notifications.show({
            color: 'green',
            title: 'Member removed',
            message: 'User was removed from this board.',
          });
        } catch (error) {
          setBoard((prev) => {
            if (prev === null) {
              return prev;
            }
            if ((prev.members ?? []).some((m) => extractUser(m.userId)._id === userId)) {
              return prev;
            }
            return {
              ...prev,
              members: sortBoardMembersByDisplayName([...(prev.members ?? []), found]),
            };
          });
          setDirectoryUsers((prev) => prev.filter((u) => u._id !== userId));
          notifications.show({
            color: 'red',
            title: 'Could not remove member',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      })();
    },
    [boardId, canRemoveMember]
  );

  const handleRoleChange = useCallback(async (userId: string, roleKey: RoleKey) => {
    if (!canUpdateMemberRole) {
      return;
    }
    const current = boardRef.current?.members?.find((m) => extractUser(m.userId)._id === userId);
    const previousRoleKey = current?.roleKey;
    if (previousRoleKey === undefined || previousRoleKey === roleKey) {
      return;
    }

    setBoard((prev) => {
      if (prev === null || prev.members === undefined) {
        return prev;
      }
      return {
        ...prev,
        members: prev.members.map((m) =>
          extractUser(m.userId)._id === userId ? { ...m, roleKey } : m,
        ),
      };
    });

    try {
      await api.updateBoardMemberRole(boardId, userId, roleKey);
    } catch (error) {
      setBoard((prev) => {
        if (prev === null || prev.members === undefined) {
          return prev;
        }
        return {
          ...prev,
          members: prev.members.map((m) =>
            extractUser(m.userId)._id === userId
              ? { ...m, roleKey: previousRoleKey }
              : m,
          ),
        };
      });
      notifications.show({
        color: 'red',
        title: 'Could not update role',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [boardId, canUpdateMemberRole]);

  const onMemberRoleChange = useCallback(
    (userId: string, roleKey: RoleKey) => {
      void handleRoleChange(userId, roleKey);
    },
    [handleRoleChange]
  );

  if (boardLoading && !board) {
    return (
      <Box className="board-member-management__root" ta="center" py="xl">
        <Loader size="sm" />
      </Box>
    );
  }

  return (
    <Box className="board-member-management__root">
      <div
        className={
          isMobileStackedLayout
            ? 'board-member-management__grid board-member-management__grid--mobile-stacked'
            : 'board-member-management__grid'
        }
      >
        <Paper
          withBorder={!isMobileStackedLayout}
          radius={isMobileStackedLayout ? 0 : 'md'}
          p={isMobileStackedLayout ? 0 : 'md'}
          className="board-member-management__panel-paper"
          h="100%"
        >
          <Stack
            gap={isMobileStackedLayout ? 'xs' : 'md'}
            className="board-member-management__panel-head"
            style={{ flexShrink: 0 }}
          >
            <Text fw={700} size="md">
              All Users
            </Text>
            <BoardMemberEnterToSearchField
              key={`dir-${boardId}`}
              ariaLabel="Search users to add"
              placeholder="Search users to add..."
              onCommit={setDirectoryQuery}
            />
            <Text size="sm" c="dimmed">
              {canAddMember
                ? 'Select a role and add users to this board.'
                : 'You do not have permission to add members to this board.'}
            </Text>
            {hasUnmappedDirectoryPlaceholders && canRemoveMember ? (
              <Button
                variant="light"
                color="orange"
                size="xs"
                onClick={() => setDiscardPlaceholdersOpen(true)}
              >
                Discard all placeholder users
              </Button>
            ) : null}
          </Stack>

          <Box
            className="board-member-management__table-scroll"
            style={{
              maxHeight: '100%',
              overflow: 'hidden',
              flex: '1 1 auto',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {directoryLoading ? (
              <Group justify="center" py="md">
                <Loader size="sm" />
              </Group>
            ) : directoryUsers.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                {directoryQuery !== ''
                  ? 'No users match your search.'
                  : 'Everyone who can be listed is already on this board, or no users exist yet.'}
              </Text>
            ) : (
              <TableVirtuoso
                className="board-member-management__virtuoso-root"
                style={{ height: '100%', minHeight: 0, width: '100%', flex: 1 }}
                data={directoryUsers}
                components={boardMemberTableVirtuosoComponents}
                computeItemKey={(_index, user) => user._id}
                fixedItemHeight={BOARD_MEMBER_TABLE_ROW_PX}
                increaseViewportBy={BOARD_MEMBER_VIRTUOSO_VIEWPORT_PAD}
                overscan={BOARD_MEMBER_VIRTUOSO_OVERSCAN}
                endReached={handleDirectoryEndReached}
                itemContent={(_index, user) => (
                  <DirectoryUserTableRow
                    user={user}
                    roleKey={addRoles[user._id] ?? 'viewer'}
                    roleOptions={roleOptions}
                    canAddMember={canAddMember}
                    canUpdateMemberRole={canUpdateMemberRole}
                    onRoleChange={handleDirectoryRoleChange}
                    onAddUser={handleAddUser}
                    compactLayout={isMobileStackedLayout}
                  />
                )}
              />
            )}
          </Box>
        </Paper>

        <Paper
          withBorder={!isMobileStackedLayout}
          radius={isMobileStackedLayout ? 0 : 'md'}
          p={isMobileStackedLayout ? 0 : 'md'}
          className="board-member-management__panel-paper"
          h="100%"
        >
          <Stack
            gap={isMobileStackedLayout ? 'xs' : 'md'}
            className="board-member-management__panel-head"
            style={{ flexShrink: 0 }}
          >
            <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
              <Group gap="xs" align="center" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                <Text fw={700} size="md" style={{ flexShrink: 0 }}>
                  Current Members ({memberCount})
                </Text>
                {memberRoleFilter != null && memberRoleFilterLabel != null ? (
                  <Badge
                    variant="light"
                    size="sm"
                    color="blue"
                    rightSection={
                      <ActionIcon
                        size="xs"
                        variant="transparent"
                        color="blue"
                        aria-label="Clear role filter"
                        onClick={() => {
                          setMemberRoleFilter(null);
                        }}
                      >
                        <IconX size={12} stroke={2} />
                      </ActionIcon>
                    }
                  >
                    {memberRoleFilterLabel}
                  </Badge>
                ) : null}
              </Group>
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon
                    variant={memberRoleFilter != null ? 'light' : 'subtle'}
                    color={memberRoleFilter != null ? 'blue' : 'gray'}
                    aria-label="Filter members by role"
                  >
                    <IconFilter size={18} stroke={1.75} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {roleOptions.map((option) => (
                    <Menu.Item
                      key={option.value}
                      onClick={() => {
                        setMemberRoleFilter(option.value);
                      }}
                    >
                      {option.label}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            </Group>
            <BoardMemberEnterToSearchField
              key={`mem-${boardId}`}
              ariaLabel="Search current members"
              placeholder="Search members..."
              onCommit={setMemberFilterQuery}
            />
          </Stack>

          <Box
            className="board-member-management__members-body"
            style={{
              flex: 1,
              minHeight: 0,
              ...(isMobileStackedLayout ? {} : { marginTop: 'var(--mantine-spacing-md)' }),
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {filteredMemberPanelRows.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                {memberRoleFilter != null
                  ? 'No members with this role.'
                  : memberFilterQuery.trim() !== ''
                    ? 'No members match your search.'
                    : 'No members to show.'}
              </Text>
            ) : (
              <Box
                className="board-member-management__table-scroll"
                style={{
                  flex: '1 1 auto',
                  minHeight: 0,
                  maxHeight: '100%',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <TableVirtuoso
                  className="board-member-management__virtuoso-root"
                  style={{ height: '100%', minHeight: 0, width: '100%', flex: 1 }}
                  data={filteredMemberPanelRows}
                  components={boardMemberTableVirtuosoComponents}
                  computeItemKey={(_index, row) =>
                    row.kind === 'owner' ? `owner:${row.user._id}` : extractUser(row.member.userId)._id
                  }
                  fixedItemHeight={BOARD_MEMBER_TABLE_ROW_PX}
                  increaseViewportBy={BOARD_MEMBER_VIRTUOSO_VIEWPORT_PAD}
                  overscan={BOARD_MEMBER_CURRENT_LIST_OVERSCAN}
                  endReached={handleMemberListEndReached}
                  itemContent={(_index, row) => {
                    if (row.kind === 'owner') {
                      return <OwnerTableCells user={row.user} compactLayout={isMobileStackedLayout} />;
                    }
                    const user = extractUser(row.member.userId);
                    return (
                      <MemberTableCells
                        user={user}
                        roleKey={row.member.roleKey}
                        roleOptions={roleOptions}
                        canRemoveMember={canRemoveMember}
                        canUpdateMemberRole={canUpdateMemberRole}
                        onRoleChange={onMemberRoleChange}
                        onRemoveMember={handleRemoveMember}
                        compactLayout={isMobileStackedLayout}
                      />
                    );
                  }}
                />
              </Box>
            )}
            {membersNextCursor !== undefined || membersLoadingMore ? (
              <Group justify="center" mt="sm" style={{ flexShrink: 0 }} gap="sm">
                {membersLoadingMore ? <Loader size="xs" /> : null}
                {membersNextCursor !== undefined ? (
                  <Button
                    size="xs"
                    variant="light"
                    loading={membersLoadingMore}
                    onClick={() => {
                      void fetchNextMemberPage();
                    }}
                  >
                    Load more
                  </Button>
                ) : null}
              </Group>
            ) : null}
          </Box>
        </Paper>
      </div>
      <Modal
        opened={discardPlaceholdersOpen}
        onClose={() => {
          if (!discardingPlaceholders) {
            setDiscardPlaceholdersOpen(false);
          }
        }}
        title="Discard all placeholder users?"
        centered
      >
        <Stack gap="sm">
          <Text size="sm">
            This removes every import placeholder from this board and deletes those placeholder accounts. People
            who already signed in and were mapped to real accounts are not affected.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              disabled={discardingPlaceholders}
              onClick={() => setDiscardPlaceholdersOpen(false)}
            >
              Cancel
            </Button>
            <Button
              color="orange"
              loading={discardingPlaceholders}
              onClick={() => {
                void handleDiscardAllPlaceholders();
              }}
            >
              Yes, discard placeholders
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}
