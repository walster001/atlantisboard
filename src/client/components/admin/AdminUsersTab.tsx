import { memo, useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Paper,
  Progress,
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
  readonly authProvider: 'password' | 'google' | 'google+password' | 'none';
  readonly canImportBoards: boolean;
  readonly canCreateWorkspace: boolean;
}

interface UserCapabilityDraft {
  readonly canImportBoards: boolean;
  readonly canCreateWorkspace: boolean;
}

interface AdminUsersTabProps {
  readonly currentUserId?: string;
}

const PAGE_LIMIT = 100;
const MASTER_DELETE_PROGRESS_NOTIFICATION_ID = 'admin-master-delete-progress';

function renderMasterDeleteProgressMessage(label: string, value: number): ReactElement {
  return (
    <Stack gap={6}>
      <Text size="sm">{label}</Text>
      <Progress value={value} radius="md" size="sm" />
    </Stack>
  );
}

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

function draftFromUsers(users: readonly AdminUserRow[]): Record<string, UserCapabilityDraft> {
  const draft: Record<string, UserCapabilityDraft> = {};
  for (const user of users) {
    draft[user._id] = {
      canImportBoards: user.canImportBoards,
      canCreateWorkspace: user.canCreateWorkspace,
    };
  }
  return draft;
}

function masterCheckboxState(
  users: readonly AdminUserRow[],
  draft: Record<string, UserCapabilityDraft>,
  field: keyof UserCapabilityDraft,
): { readonly checked: boolean; readonly indeterminate: boolean } {
  const editable = users.filter((u) => !u.isAppAdmin);
  if (editable.length === 0) {
    return { checked: false, indeterminate: false };
  }
  let enabledCount = 0;
  for (const user of editable) {
    const row = draft[user._id];
    if (row?.[field] === true) {
      enabledCount += 1;
    }
  }
  if (enabledCount === 0) {
    return { checked: false, indeterminate: false };
  }
  if (enabledCount === editable.length) {
    return { checked: true, indeterminate: false };
  }
  return { checked: false, indeterminate: true };
}

const UserRow = memo(function UserRow(props: {
  readonly user: AdminUserRow;
  readonly draft: UserCapabilityDraft;
  readonly isCurrentUser: boolean;
  readonly onImportChange: (userId: string, checked: boolean) => void;
  readonly onCreateWorkspaceChange: (userId: string, checked: boolean) => void;
  readonly onDeleteClick: (user: AdminUserRow) => void;
}) {
  const { user, draft, isCurrentUser, onImportChange, onCreateWorkspaceChange, onDeleteClick } = props;
  const capsDisabled = user.isAppAdmin;
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

  const capabilityCheckbox = (checked: boolean, onChange: (next: boolean) => void): ReactElement => {
    if (capsDisabled) {
      return (
        <Tooltip label="App admins always have this capability." position="top">
          <span>
            <Checkbox checked={true} disabled readOnly aria-label="Always enabled for app admin" />
          </span>
        </Tooltip>
      );
    }
    return <Checkbox checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />;
  };

  return (
    <Table.Tr>
      <Table.Td style={{ textAlign: 'center' }}>
        {capabilityCheckbox(draft.canImportBoards, (next) => onImportChange(user._id, next))}
      </Table.Td>
      <Table.Td style={{ textAlign: 'center' }}>
        {capabilityCheckbox(draft.canCreateWorkspace, (next) => onCreateWorkspaceChange(user._id, next))}
      </Table.Td>
      <Table.Td>{user.displayName}</Table.Td>
      <Table.Td>{user.email}</Table.Td>
      <Table.Td>{user.username}</Table.Td>
      <Table.Td>{user.isAppAdmin ? 'Yes' : 'No'}</Table.Td>
      <Table.Td>{formatDateTime(user.createdAt)}</Table.Td>
      <Table.Td>{formatDateTime(user.lastLogin)}</Table.Td>
      <Table.Td>{user.emailVerified ? 'Yes' : 'No'}</Table.Td>
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
  const [draftCaps, setDraftCaps] = useState<Record<string, UserCapabilityDraft>>({});
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savingCaps, setSavingCaps] = useState(false);
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
        setDraftCaps((prev) => {
          const merged = { ...prev };
          for (const row of incoming) {
            if (merged[row._id] === undefined) {
              merged[row._id] = {
                canImportBoards: row.canImportBoards,
                canCreateWorkspace: row.canCreateWorkspace,
              };
            }
          }
          return merged;
        });
      } else {
        setUsers(incoming);
        setDraftCaps(draftFromUsers(incoming));
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

  const savedCaps = useMemo(() => draftFromUsers(users), [users]);

  const capabilityUpdates = useMemo(() => {
    const updates: Array<{
      userId: string;
      canImportBoards: boolean;
      canCreateWorkspace: boolean;
    }> = [];
    for (const user of users) {
      if (user.isAppAdmin) {
        continue;
      }
      const draft = draftCaps[user._id];
      const saved = savedCaps[user._id];
      if (draft === undefined || saved === undefined) {
        continue;
      }
      if (
        draft.canImportBoards !== saved.canImportBoards ||
        draft.canCreateWorkspace !== saved.canCreateWorkspace
      ) {
        updates.push({
          userId: user._id,
          canImportBoards: draft.canImportBoards,
          canCreateWorkspace: draft.canCreateWorkspace,
        });
      }
    }
    return updates;
  }, [users, draftCaps, savedCaps]);

  const hasUnsavedCapabilityChanges = capabilityUpdates.length > 0;

  const importMaster = useMemo(
    () => masterCheckboxState(sortedUsers, draftCaps, 'canImportBoards'),
    [sortedUsers, draftCaps],
  );
  const createWorkspaceMaster = useMemo(
    () => masterCheckboxState(sortedUsers, draftCaps, 'canCreateWorkspace'),
    [sortedUsers, draftCaps],
  );

  const setMasterCapability = useCallback(
    (field: keyof UserCapabilityDraft, checked: boolean): void => {
      setDraftCaps((prev) => {
        const next = { ...prev };
        for (const user of sortedUsers) {
          if (user.isAppAdmin) {
            continue;
          }
          const existing = next[user._id] ?? {
            canImportBoards: user.canImportBoards,
            canCreateWorkspace: user.canCreateWorkspace,
          };
          next[user._id] = { ...existing, [field]: checked };
        }
        return next;
      });
    },
    [sortedUsers],
  );

  const handleSaveCapabilities = useCallback(async (): Promise<void> => {
    if (capabilityUpdates.length === 0) {
      return;
    }
    setSavingCaps(true);
    setError(null);
    try {
      await api.updateAdminUserAccountCapabilities({ updates: capabilityUpdates });
      setUsers((prev) =>
        prev.map((user) => {
          const update = capabilityUpdates.find((entry) => entry.userId === user._id);
          if (update === undefined) {
            return user;
          }
          return {
            ...user,
            canImportBoards: update.canImportBoards,
            canCreateWorkspace: update.canCreateWorkspace,
          };
        }),
      );
      notifications.show({
        color: 'green',
        title: 'Saved',
        message: `Updated account capabilities for ${capabilityUpdates.length} user(s).`,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save account capabilities';
      setError(message);
      notifications.show({
        color: 'red',
        title: 'Save failed',
        message,
      });
    } finally {
      setSavingCaps(false);
    }
  }, [capabilityUpdates]);

  const handleDeleteConfirmed = useCallback(async (): Promise<void> => {
    if (!confirmDeleteUser) {
      return;
    }
    setDeletingUserId(confirmDeleteUser._id);
    notifications.show({
      id: MASTER_DELETE_PROGRESS_NOTIFICATION_ID,
      color: 'blue',
      title: 'Master delete in progress',
      message: renderMasterDeleteProgressMessage('Removing user data…', 25),
      loading: true,
      autoClose: false,
      withCloseButton: false,
      position: 'bottom-right',
    });
    try {
      const result = await api.deleteAdminUser(confirmDeleteUser._id);
      setUsers((prev) => prev.filter((u) => u._id !== confirmDeleteUser._id));
      setDraftCaps((prev) => {
        const next = { ...prev };
        delete next[confirmDeleteUser._id];
        return next;
      });
      const stats = result.stats;
      const successMessage = [
        `${confirmDeleteUser.displayName} removed successfully.`,
        `Workspaces: ${stats.removedWorkspaceMemberships}`,
        `Boards: ${stats.removedBoardMemberships}`,
        `Sessions: ${stats.deletedSessions}`,
        `Activities: ${stats.deletedActivities}`,
      ].join(' • ');
      notifications.update({
        id: MASTER_DELETE_PROGRESS_NOTIFICATION_ID,
        color: 'green',
        title: 'Master delete complete',
        message: successMessage,
        loading: false,
        autoClose: 9000,
        withCloseButton: true,
        position: 'bottom-right',
      });
      setConfirmDeleteUser(null);
    } catch (e) {
      notifications.update({
        id: MASTER_DELETE_PROGRESS_NOTIFICATION_ID,
        color: 'red',
        title: 'Master delete failed',
        message: e instanceof Error ? e.message : 'Could not delete user.',
        loading: false,
        autoClose: false,
        withCloseButton: true,
        position: 'bottom-right',
      });
    } finally {
      setDeletingUserId(null);
    }
  }, [confirmDeleteUser]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="end" wrap="wrap">
        <Box>
          <Text fw={700} size="lg">
            Users
          </Text>
          <Text size="sm" c="dimmed">
            View and manage all application users.
          </Text>
        </Box>
        <Group align="end" wrap="nowrap">
          <Button
            variant="filled"
            disabled={!hasUnsavedCapabilityChanges}
            loading={savingCaps}
            onClick={() => {
              void handleSaveCapabilities();
            }}
          >
            Save changes
          </Button>
          <BoardMemberEnterToSearchField
            ariaLabel="Search users"
            placeholder="Search users..."
            onCommit={setQuery}
          />
        </Group>
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
                  <Table.Th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <Stack gap={4} align="center">
                      <Text size="sm" fw={600}>
                        Import Boards
                      </Text>
                      <Checkbox
                        checked={importMaster.checked}
                        indeterminate={importMaster.indeterminate}
                        onChange={(event) => {
                          setMasterCapability('canImportBoards', event.currentTarget.checked);
                        }}
                        aria-label="Select all import boards"
                      />
                    </Stack>
                  </Table.Th>
                  <Table.Th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <Stack gap={4} align="center">
                      <Text size="sm" fw={600}>
                        Create workspace
                      </Text>
                      <Checkbox
                        checked={createWorkspaceMaster.checked}
                        indeterminate={createWorkspaceMaster.indeterminate}
                        onChange={(event) => {
                          setMasterCapability('canCreateWorkspace', event.currentTarget.checked);
                        }}
                        aria-label="Select all create workspace"
                      />
                    </Stack>
                  </Table.Th>
                  <Table.Th>Full name</Table.Th>
                  <Table.Th>Email</Table.Th>
                  <Table.Th>Username</Table.Th>
                  <Table.Th>App Admin</Table.Th>
                  <Table.Th>Created At</Table.Th>
                  <Table.Th>Last Login</Table.Th>
                  <Table.Th>Email Verified</Table.Th>
                  <Table.Th>Auth Provider</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sortedUsers.map((user) => {
                  const draft = draftCaps[user._id] ?? {
                    canImportBoards: user.canImportBoards,
                    canCreateWorkspace: user.canCreateWorkspace,
                  };
                  return (
                    <UserRow
                      key={user._id}
                      user={user}
                      draft={draft}
                      isCurrentUser={currentUserId != null && user._id === currentUserId}
                      onImportChange={(userId, checked) => {
                        setDraftCaps((prev) => ({
                          ...prev,
                          [userId]: {
                            ...(prev[userId] ?? {
                              canImportBoards: false,
                              canCreateWorkspace: false,
                            }),
                            canImportBoards: checked,
                          },
                        }));
                      }}
                      onCreateWorkspaceChange={(userId, checked) => {
                        setDraftCaps((prev) => ({
                          ...prev,
                          [userId]: {
                            ...(prev[userId] ?? {
                              canImportBoards: false,
                              canCreateWorkspace: false,
                            }),
                            canCreateWorkspace: checked,
                          },
                        }));
                      }}
                      onDeleteClick={setConfirmDeleteUser}
                    />
                  );
                })}
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
        title="Confirm master delete"
        centered
      >
        <Stack gap="sm">
          <Alert color="red" variant="light">
            This will run a permanent master delete: remove this user from all boards/workspaces, purge their user data, and delete their account.
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
              Yes, master delete user
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
});
