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

const ROW_PX = 96;
const ROLE_COL_PX = 122;
const ACTION_COL_PX = 118;
const DIRECTORY_PAGE_LIMIT = 100;
const VIRTUOSO_VIEWPORT_PAD = { top: 80, bottom: 120 } as const;
const VIRTUOSO_OVERSCAN = 6;

const AdminDirectoryTable = forwardRef<HTMLTableElement, ComponentPropsWithoutRef<'table'>>(
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
AdminDirectoryTable.displayName = 'AdminDirectoryTable';

const AdminDirectoryTableRow = forwardRef<HTMLTableRowElement, ComponentPropsWithoutRef<'tr'>>(
  ({ style, ...rest }, ref) => (
    <tr
      {...rest}
      ref={ref}
      style={{
        ...style,
        height: ROW_PX,
        boxSizing: 'border-box',
      }}
    />
  ),
);
AdminDirectoryTableRow.displayName = 'AdminDirectoryTableRow';

const directoryTableComponents = {
  Table: AdminDirectoryTable,
  TableRow: AdminDirectoryTableRow,
};

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

const UserIdentityStack = memo(function UserIdentityStack(props: { readonly user: AppAdminUserRow }) {
  const { user } = props;
  const email = user.email.trim();
  return (
    <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
      <Text fw={600} size="sm" lineClamp={1}>
        {user.displayName}
      </Text>
      <Tooltip label={email} disabled={email === ''} openDelay={350} position="top-start" multiline maw={420}>
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
    <Box className="board-member-management__root">
      <div className="board-member-management__grid">
        <Paper withBorder radius="md" p="md" className="board-member-management__panel-paper" h="100%">
          <Stack gap="md" style={{ flexShrink: 0 }}>
            <Text fw={700} size="md">
              All Users
            </Text>
            <BoardMemberEnterToSearchField
              ariaLabel="Search registered users"
              placeholder="Search users to add..."
              onCommit={setDirectoryQuery}
            />
            <Text size="sm" c="dimmed">
              Non–App Admins only. Search filters the directory; press Enter to apply.
            </Text>
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
                fixedItemHeight={ROW_PX}
                increaseViewportBy={VIRTUOSO_VIEWPORT_PAD}
                overscan={VIRTUOSO_OVERSCAN}
                endReached={handleDirectoryEndReached}
                itemContent={(_index, user) => (
                  <>
                    <td className="board-member-management__td board-member-management__td--user">
                      <Group gap="sm" wrap="nowrap" align="flex-start">
                        <Avatar
                          size={APP_USER_AVATAR_SIZE}
                          color="gray"
                          mt={2}
                          {...(user.profilePicture != null && user.profilePicture !== ''
                            ? { src: user.profilePicture }
                            : {})}
                        >
                          {userMenuStyleAvatarInitials(user.displayName, user.email)}
                        </Avatar>
                        <UserIdentityStack user={user} />
                      </Group>
                    </td>
                    <td className="board-member-management__td board-member-management__td--role">
                      <Text size="xs" c="dimmed" ta="end">
                        —
                      </Text>
                    </td>
                    <td className="board-member-management__td board-member-management__td--action">
                      <Button
                        size="xs"
                        color="blue"
                        leftSection={<IconPlus size={14} stroke={2} />}
                        onClick={() => {
                          void handleAdd(user);
                        }}
                      >
                        Add
                      </Button>
                    </td>
                  </>
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

        <Paper withBorder radius="md" p="md" className="board-member-management__panel-paper" h="100%">
          <Stack gap="md" style={{ flexShrink: 0 }}>
            <Text fw={700} size="md">
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
              marginTop: 'var(--mantine-spacing-md)',
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
                  components={directoryTableComponents}
                  computeItemKey={(_index, u) => u._id}
                  fixedItemHeight={ROW_PX}
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
                      <>
                        <td className="board-member-management__td board-member-management__td--user">
                          <Group gap="sm" wrap="nowrap" align="flex-start">
                            <Avatar size={APP_USER_AVATAR_SIZE} color="gray" mt={2}>
                              {userMenuStyleAvatarInitials(user.displayName, user.email)}
                            </Avatar>
                            <UserIdentityStack user={user} />
                          </Group>
                        </td>
                        <td className="board-member-management__td board-member-management__td--role">
                          <Badge size="sm" variant="light" color="blue">
                            App Admin
                          </Badge>
                        </td>
                        <td className="board-member-management__td board-member-management__td--action">
                          {canRemove ? (
                            <Button
                              size="xs"
                              color="red"
                              variant="light"
                              leftSection={<IconUserMinus size={14} stroke={2} />}
                              onClick={() => {
                                void handleRemove(user);
                              }}
                            >
                              Remove
                            </Button>
                          ) : (
                            <Tooltip
                              label={
                                blockSelfBootstrap
                                  ? 'The bootstrap App Admin cannot remove their own access. Add another App Admin first, then they can remove you if needed.'
                                  : 'At least one App Admin must remain.'
                              }
                              position="left"
                              maw={280}
                              multiline
                            >
                              <Text size="xs" c="dimmed" ta="end">
                                —
                              </Text>
                            </Tooltip>
                          )}
                        </td>
                      </>
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
