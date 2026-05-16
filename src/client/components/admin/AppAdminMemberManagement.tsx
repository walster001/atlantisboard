import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  type ComponentPropsWithoutRef,
  memo,
} from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconUserMinus } from '@tabler/icons-react';
import { TableVirtuoso } from 'react-virtuoso';
import axios from 'axios';
import { useResponsiveTier } from '../../hooks/useResponsiveTier.js';
import { APP_USER_AVATAR_SIZE } from '../../constants/userAvatar.js';
import { api } from '../../utils/api.js';
import { userMenuStyleAvatarInitials } from '../../utils/userMenuStyleAvatarInitials.js';
import { BoardMemberEnterToSearchField } from '../board/BoardMemberEnterToSearchField.js';
import '../board/boardMemberManagement.css';

function isSearchRequestCancelled(error: unknown): boolean {
  return axios.isCancel(error);
}

export interface AppAdminUserRow {
  readonly _id: string;
  readonly displayName: string;
  readonly email: string;
  readonly profilePicture?: string | undefined;
}

const TABLE_ROW_PX_DESKTOP = 96;
const TABLE_ROW_PX_MOBILE = 80;
const DESKTOP_ACTION_COL_PX = 108;
const DESKTOP_ROLE_COL_PX = 108;
const MOBILE_ACTION_COL_PX = 48;
const MOBILE_AVATAR_PX = 32;
const DIRECTORY_PAGE_LIMIT = 100;
const VIRTUOSO_VIEWPORT_PAD = { top: 80, bottom: 120 } as const;
const VIRTUOSO_OVERSCAN = 6;

function createAppAdminTableComponents(options: {
  readonly compactLayout: boolean;
  readonly includeRoleColumn: boolean;
}): {
  Table: ReturnType<typeof forwardRef<HTMLTableElement, ComponentPropsWithoutRef<'table'>>>;
  TableRow: ReturnType<typeof forwardRef<HTMLTableRowElement, ComponentPropsWithoutRef<'tr'>>>;
} {
  const { compactLayout, includeRoleColumn } = options;
  const rowPx = compactLayout ? TABLE_ROW_PX_MOBILE : TABLE_ROW_PX_DESKTOP;
  const actionColPx = compactLayout ? MOBILE_ACTION_COL_PX : DESKTOP_ACTION_COL_PX;

  const Table = forwardRef<HTMLTableElement, ComponentPropsWithoutRef<'table'>>(
    ({ style, className, children, ...props }, ref) => (
      <table
        ref={ref}
        {...props}
        className={['board-member-management__data-table', className].filter(Boolean).join(' ')}
        style={{
          width: '100%',
          maxWidth: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          ...style,
        }}
      >
        <colgroup>
          <col />
          {includeRoleColumn ? <col style={{ width: DESKTOP_ROLE_COL_PX }} /> : null}
          <col style={{ width: actionColPx }} />
        </colgroup>
        {children}
      </table>
    ),
  );
  Table.displayName = 'AppAdminDataTable';

  const TableRow = forwardRef<HTMLTableRowElement, ComponentPropsWithoutRef<'tr'>>(
    ({ style, ...rest }, ref) => (
      <tr
        {...rest}
        ref={ref}
        style={{
          ...style,
          height: rowPx,
          boxSizing: 'border-box',
        }}
      />
    ),
  );
  TableRow.displayName = 'AppAdminDataTableRow';

  return { Table, TableRow };
}

function compareUserRowsByDisplayName(a: AppAdminUserRow, b: AppAdminUserRow): number {
  const byName = a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
  if (byName !== 0) return byName;
  return a.email.localeCompare(b.email, undefined, { sensitivity: 'base' });
}

function sortUsers(users: readonly AppAdminUserRow[]): AppAdminUserRow[] {
  return [...users].sort(compareUserRowsByDisplayName);
}

function normalizeString(value: string): string {
  return value.trim().toLowerCase();
}

function adminMatchesQuery(admin: AppAdminUserRow, query: string): boolean {
  const q = normalizeString(query);
  if (q === '') return true;
  return (
    normalizeString(admin.displayName).includes(q) || normalizeString(admin.email).includes(q)
  );
}

const UserIdentityStack = memo(function UserIdentityStack(props: {
  readonly user: AppAdminUserRow;
  readonly compact?: boolean;
  readonly showAdminBadge?: boolean;
}) {
  const { user, compact = false, showAdminBadge = false } = props;
  const email = user.email.trim();
  return (
    <Stack gap={compact ? 2 : 0} style={{ flex: 1, minWidth: 0 }}>
      <Group gap={6} wrap="nowrap" align="center" style={{ minWidth: 0 }}>
        <Text fw={600} size={compact ? 'xs' : 'sm'} lineClamp={compact ? 2 : 1} style={{ flex: 1, minWidth: 0 }}>
          {user.displayName}
        </Text>
        {showAdminBadge ? (
          <Badge size="xs" variant="light" color="blue" style={{ flexShrink: 0 }}>
            Admin
          </Badge>
        ) : null}
      </Group>
      <Tooltip label={email} disabled={email === ''} openDelay={350} position="top-start" multiline maw={420}>
        <Text
          component="span"
          size="xs"
          c="dimmed"
          lineClamp={compact ? 2 : 2}
          className="board-member-management__email-text"
        >
          {user.email}
        </Text>
      </Tooltip>
    </Stack>
  );
});

const DirectoryUserTableCells = memo(function DirectoryUserTableCells(props: {
  readonly user: AppAdminUserRow;
  readonly compactLayout: boolean;
  readonly onAdd: (user: AppAdminUserRow) => void;
}) {
  const { user, compactLayout, onAdd } = props;
  const avatarSize = compactLayout ? MOBILE_AVATAR_PX : APP_USER_AVATAR_SIZE;
  return (
    <>
      <td className="board-member-management__td board-member-management__td--user">
        <Group gap={compactLayout ? 6 : 'sm'} wrap="nowrap" align="flex-start">
          <Avatar
            size={avatarSize}
            color="gray"
            mt={compactLayout ? 0 : 2}
            {...(user.profilePicture != null && user.profilePicture !== ''
              ? { src: user.profilePicture }
              : {})}
          >
            {userMenuStyleAvatarInitials(user.displayName, user.email)}
          </Avatar>
          <UserIdentityStack user={user} compact={compactLayout} />
        </Group>
      </td>
      <td className="board-member-management__td board-member-management__td--action">
        {compactLayout ? (
          <Tooltip label="Add as App Admin">
            <ActionIcon
              size="lg"
              radius="md"
              color="blue"
              variant="light"
              aria-label="Add as App Admin"
              onClick={() => {
                onAdd(user);
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
              onAdd(user);
            }}
          >
            Add
          </Button>
        )}
      </td>
    </>
  );
});

const AppAdminUserTableCells = memo(function AppAdminUserTableCells(props: {
  readonly user: AppAdminUserRow;
  readonly compactLayout: boolean;
  readonly canRemove: boolean;
  readonly blockSelfBootstrap: boolean;
  readonly onRemove: (user: AppAdminUserRow) => void;
}) {
  const { user, compactLayout, canRemove, blockSelfBootstrap, onRemove } = props;
  const avatarSize = compactLayout ? MOBILE_AVATAR_PX : APP_USER_AVATAR_SIZE;
  const blockedTooltip = blockSelfBootstrap
    ? 'The bootstrap App Admin cannot remove their own access. Add another App Admin first, then they can remove you if needed.'
    : 'At least one App Admin must remain.';

  return (
    <>
      <td className="board-member-management__td board-member-management__td--user">
        <Group gap={compactLayout ? 6 : 'sm'} wrap="nowrap" align="flex-start">
          <Avatar size={avatarSize} color="gray" mt={compactLayout ? 0 : 2}>
            {userMenuStyleAvatarInitials(user.displayName, user.email)}
          </Avatar>
          <UserIdentityStack user={user} compact={compactLayout} showAdminBadge={compactLayout} />
        </Group>
      </td>
      {compactLayout ? null : (
        <td className="board-member-management__td board-member-management__td--role">
          <Badge size="sm" variant="light" color="blue">
            App Admin
          </Badge>
        </td>
      )}
      <td className="board-member-management__td board-member-management__td--action">
        {canRemove ? (
          compactLayout ? (
            <Tooltip label="Remove App Admin">
              <ActionIcon
                size="lg"
                radius="md"
                color="red"
                variant="light"
                aria-label="Remove App Admin"
                onClick={() => {
                  onRemove(user);
                }}
              >
                <IconUserMinus size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <Button
              size="xs"
              color="red"
              variant="light"
              leftSection={<IconUserMinus size={14} stroke={2} />}
              onClick={() => {
                onRemove(user);
              }}
            >
              Remove
            </Button>
          )
        ) : compactLayout ? (
          <Tooltip label={blockedTooltip} position="left" maw={280} multiline>
            <ActionIcon
              size="lg"
              radius="md"
              color="gray"
              variant="subtle"
              aria-label={blockedTooltip}
              disabled
            >
              <IconUserMinus size={18} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <Tooltip label={blockedTooltip} position="left" maw={280} multiline>
            <span />
          </Tooltip>
        )}
      </td>
    </>
  );
});

interface AppAdminMemberManagementProps {
  readonly appAdmins: readonly AppAdminUserRow[];
  readonly onAppAdminsChange: () => Promise<void>;
  readonly currentUserId: string | undefined;
  readonly bootstrapAppAdminId: string | null;
}

function cannotRemoveOwnBootstrapAccess(
  adminId: string,
  currentUserId: string | undefined,
  bootstrapAppAdminId: string | null,
): boolean {
  if (currentUserId === undefined || bootstrapAppAdminId === null) {
    return false;
  }
  return adminId === currentUserId && adminId === bootstrapAppAdminId;
}

export function AppAdminMemberManagement({
  appAdmins,
  onAppAdminsChange,
  currentUserId,
  bootstrapAppAdminId,
}: AppAdminMemberManagementProps) {
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [directoryUsers, setDirectoryUsers] = useState<AppAdminUserRow[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryLoadingMore, setDirectoryLoadingMore] = useState(false);
  const [directoryNextCursor, setDirectoryNextCursor] = useState<string | undefined>(undefined);
  const [memberFilterQuery, setMemberFilterQuery] = useState('');
  const directoryPagingLockRef = useRef(false);
  const directoryQueryRef = useRef(directoryQuery);
  directoryQueryRef.current = directoryQuery;

  const isMobileStackedLayout = useResponsiveTier() === 'mobile';
  const tableRowPx = isMobileStackedLayout ? TABLE_ROW_PX_MOBILE : TABLE_ROW_PX_DESKTOP;

  const directoryTableComponents = useMemo(
    () =>
      createAppAdminTableComponents({
        compactLayout: isMobileStackedLayout,
        includeRoleColumn: false,
      }),
    [isMobileStackedLayout],
  );

  const adminsTableComponents = useMemo(
    () =>
      createAppAdminTableComponents({
        compactLayout: isMobileStackedLayout,
        includeRoleColumn: !isMobileStackedLayout,
      }),
    [isMobileStackedLayout],
  );

  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      setDirectoryLoading(true);
      setDirectoryNextCursor(undefined);
      try {
        const response = await api.searchUsers(directoryQuery, {
          appAdminDirectory: true,
          limit: DIRECTORY_PAGE_LIMIT,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const users = (response.users as AppAdminUserRow[]) || [];
        setDirectoryUsers(sortUsers(users));
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
          limit: DIRECTORY_PAGE_LIMIT,
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
          return sortUsers(merged);
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
        setDirectoryUsers((prev) => (prev.some((u) => u._id === user._id) ? prev : sortUsers([...prev, user])));
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
        setDirectoryUsers((prev) => (prev.some((u) => u._id === user._id) ? prev : sortUsers([...prev, user])));
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

  return (
    <Box
      className={[
        'board-member-management__root',
        isMobileStackedLayout ? 'board-member-management__root--app-admin-mobile' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className={
          isMobileStackedLayout
            ? 'board-member-management__grid board-member-management__grid--mobile-stacked board-member-management__grid--app-admin-mobile'
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
          <Stack gap={isMobileStackedLayout ? 'xs' : 'md'} style={{ flexShrink: 0 }}>
            <Text fw={700} size={isMobileStackedLayout ? 'sm' : 'md'}>
              All Users
            </Text>
            <BoardMemberEnterToSearchField
              ariaLabel="Search registered users"
              placeholder="Search users to add..."
              onCommit={setDirectoryQuery}
            />
            {!isMobileStackedLayout ? (
              <Text size="sm" c="dimmed">
                Non–App Admins only. Search filters the directory; press Enter to apply.
              </Text>
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
                {directoryQuery.trim() !== ''
                  ? 'No users match your search.'
                  : 'Every registered user is already an App Admin, or no users exist yet.'}
              </Text>
            ) : (
              <TableVirtuoso
                className="board-member-management__virtuoso-root"
                style={{ height: '100%', minHeight: 0, width: '100%', flex: 1 }}
                data={directoryUsers}
                components={directoryTableComponents}
                computeItemKey={(_index, user) => user._id}
                fixedItemHeight={tableRowPx}
                increaseViewportBy={VIRTUOSO_VIEWPORT_PAD}
                overscan={VIRTUOSO_OVERSCAN}
                endReached={handleDirectoryEndReached}
                itemContent={(_index, user) => (
                  <DirectoryUserTableCells
                    user={user}
                    compactLayout={isMobileStackedLayout}
                    onAdd={(row) => {
                      void handleAdd(row);
                    }}
                  />
                )}
              />
            )}
            {directoryLoadingMore ? (
              <Group justify="center" py="xs">
                <Loader size="xs" />
              </Group>
            ) : null}
          </Box>
        </Paper>

        <Paper
          withBorder={!isMobileStackedLayout}
          radius={isMobileStackedLayout ? 0 : 'md'}
          p={isMobileStackedLayout ? 0 : 'md'}
          className="board-member-management__panel-paper"
          h="100%"
        >
          <Stack gap={isMobileStackedLayout ? 'xs' : 'md'} style={{ flexShrink: 0 }}>
            <Text fw={700} size={isMobileStackedLayout ? 'sm' : 'md'}>
              App Admins ({appAdmins.length})
            </Text>
            <BoardMemberEnterToSearchField
              ariaLabel="Search App Admins"
              placeholder="Search admins..."
              onCommit={setMemberFilterQuery}
            />
          </Stack>
          <Box
            style={{
              flex: 1,
              minHeight: 0,
              marginTop: isMobileStackedLayout ? undefined : 'var(--mantine-spacing-md)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {filteredAdmins.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                {memberFilterQuery.trim() !== ''
                  ? 'No App Admins match your search.'
                  : 'No App Admins found.'}
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
                  data={filteredAdmins}
                  components={adminsTableComponents}
                  computeItemKey={(_index, u) => u._id}
                  fixedItemHeight={tableRowPx}
                  increaseViewportBy={VIRTUOSO_VIEWPORT_PAD}
                  overscan={VIRTUOSO_OVERSCAN}
                  itemContent={(_index, user) => {
                    const blockSelfBootstrap = cannotRemoveOwnBootstrapAccess(
                      user._id,
                      currentUserId,
                      bootstrapAppAdminId,
                    );
                    const canRemove = appAdmins.length > 1 && !blockSelfBootstrap;
                    return (
                      <AppAdminUserTableCells
                        user={user}
                        compactLayout={isMobileStackedLayout}
                        canRemove={canRemove}
                        blockSelfBootstrap={blockSelfBootstrap}
                        onRemove={(row) => {
                          void handleRemove(row);
                        }}
                      />
                    );
                  }}
                />
              </Box>
            )}
          </Box>
        </Paper>
      </div>
    </Box>
  );
}