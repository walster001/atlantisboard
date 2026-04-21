import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api } from '../../utils/api.js';
import { BoardMemberEnterToSearchField } from '../board/BoardMemberEnterToSearchField.js';

interface AdminUserRow {
  readonly _id: string;
  readonly displayName: string;
  readonly email: string;
  readonly username: string;
  readonly isAppAdmin: boolean;
  readonly createdAt: string;
  readonly lastLogin?: string;
  readonly emailVerified: boolean;
  readonly failedLoginAttempts: number;
  readonly authProvider: 'password' | 'google' | 'google+password' | 'none';
}

interface AdminUsersTabProps {
  readonly currentUserId?: string;
}

const PAGE_LIMIT = 100;

function formatDateTime(value: string | undefined): string {
  if (value == null || value.trim() === '') {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }
  return parsed.toLocaleString();
}

function formatAuthProvider(value: AdminUserRow['authProvider']): string {
  switch (value) {
    case 'google+password':
      return 'Google + Password';
    case 'google':
      return 'Google';
    case 'password':
      return 'Password';
    default:
      return 'None';
  }
}

const UserRow = memo(function UserRow(props: {
  readonly user: AdminUserRow;
  readonly isCurrentUser: boolean;
  readonly onDeleteClick: (user: AdminUserRow) => void;
}) {
  const { user, isCurrentUser, onDeleteClick } = props;
  const deleteButton = (
    <Button
      size="xs"
      color="red"
      variant="light"
      disabled={isCurrentUser}
      onClick={() => onDeleteClick(user)}
    >
      Delete
    </Button>
  );

  return (
    <Table.Tr>
      <Table.Td>{user.displayName}</Table.Td>
      <Table.Td>{user.email}</Table.Td>
      <Table.Td>{user.username}</Table.Td>
      <Table.Td>
        <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
          {user._id}
        </Text>
      </Table.Td>
      <Table.Td>{user.isAppAdmin ? 'Yes' : 'No'}</Table.Td>
      <Table.Td>{formatDateTime(user.createdAt)}</Table.Td>
      <Table.Td>{formatDateTime(user.lastLogin)}</Table.Td>
      <Table.Td>{user.emailVerified ? 'Yes' : 'No'}</Table.Td>
      <Table.Td>{user.failedLoginAttempts}</Table.Td>
      <Table.Td>{formatAuthProvider(user.authProvider)}</Table.Td>
      <Table.Td style={{ textAlign: 'right' }}>
        {isCurrentUser ? (
          <Tooltip label="You cannot delete the account currently in use." position="left">
            <span>{deleteButton}</span>
          </Tooltip>
        ) : (
          deleteButton
        )}
      </Table.Td>
    </Table.Tr>
  );
});

export const AdminUsersTab = memo(function AdminUsersTab(props: AdminUsersTabProps) {
  const { currentUserId } = props;
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<AdminUserRow | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

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
      } else {
        setUsers(incoming);
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

  const handleDeleteConfirmed = useCallback(async (): Promise<void> => {
    if (!confirmDeleteUser) {
      return;
    }
    setDeletingUserId(confirmDeleteUser._id);
    try {
      await api.deleteAdminUser(confirmDeleteUser._id);
      setUsers((prev) => prev.filter((u) => u._id !== confirmDeleteUser._id));
      notifications.show({
        color: 'green',
        title: 'User deleted',
        message: `${confirmDeleteUser.displayName} was removed from the application.`,
      });
      setConfirmDeleteUser(null);
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Delete failed',
        message: e instanceof Error ? e.message : 'Could not delete user.',
      });
    } finally {
      setDeletingUserId(null);
    }
  }, [confirmDeleteUser]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="end">
        <Box>
          <Text fw={700} size="lg">
            Users
          </Text>
          <Text size="sm" c="dimmed">
            View and manage all application users.
          </Text>
        </Box>
        <BoardMemberEnterToSearchField
          ariaLabel="Search users"
          placeholder="Search users..."
          onCommit={setQuery}
        />
      </Group>

      {error ? <Alert color="red">{error}</Alert> : null}

      <Paper withBorder radius="md" p="sm">
        {loading ? (
          <Group justify="center" py="lg">
            <Loader size="sm" />
          </Group>
        ) : sortedUsers.length === 0 ? (
          <Text c="dimmed" ta="center" py="md">
            No users found.
          </Text>
        ) : (
          <Box style={{ overflowX: 'auto' }}>
            <Table withTableBorder withColumnBorders striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Full name</Table.Th>
                  <Table.Th>Email</Table.Th>
                  <Table.Th>Username</Table.Th>
                  <Table.Th>User ID</Table.Th>
                  <Table.Th>App Admin</Table.Th>
                  <Table.Th>Created At</Table.Th>
                  <Table.Th>Last Login</Table.Th>
                  <Table.Th>Email Verified</Table.Th>
                  <Table.Th>Failed Login Attempts</Table.Th>
                  <Table.Th>Auth Provider</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sortedUsers.map((user) => (
                  <UserRow
                    key={user._id}
                    user={user}
                    isCurrentUser={currentUserId != null && user._id === currentUserId}
                    onDeleteClick={setConfirmDeleteUser}
                  />
                ))}
              </Table.Tbody>
            </Table>
          </Box>
        )}
      </Paper>

      {nextCursor != null ? (
        <Group justify="center">
          <Button
            variant="light"
            loading={loadingMore}
            onClick={() => {
              void loadUsers(nextCursor);
            }}
          >
            Load more users
          </Button>
        </Group>
      ) : null}

      <Modal
        opened={confirmDeleteUser != null}
        onClose={() => setConfirmDeleteUser(null)}
        title="Delete user"
        centered
      >
        <Stack gap="sm">
          <Alert color="red" variant="light">
            Are you sure? This removes the user from the application database entirely.
          </Alert>
          {confirmDeleteUser ? (
            <Text size="sm">
              User: <strong>{confirmDeleteUser.displayName}</strong> ({confirmDeleteUser.email})
            </Text>
          ) : null}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setConfirmDeleteUser(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={deletingUserId != null}
              onClick={() => {
                void handleDeleteConfirmed();
              }}
            >
              Yes, delete user
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
});
