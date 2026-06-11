import { memo } from 'react';
import { Box, Checkbox, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { Virtuoso } from 'react-virtuoso';
import type { AdminUserRow, UserCapabilityDraft } from './adminUsersTabUtils.js';
import { AdminUsersMobileCard } from './AdminUsersMobileCard.js';

type AdminUsersMobileListProps = {
  readonly sortedUsers: readonly AdminUserRow[];
  readonly draftCaps: Record<string, UserCapabilityDraft>;
  readonly currentUserId: string | undefined;
  readonly loadingMore: boolean;
  readonly importMaster: { readonly checked: boolean; readonly indeterminate: boolean };
  readonly createWorkspaceMaster: { readonly checked: boolean; readonly indeterminate: boolean };
  readonly onMasterImportChange: (checked: boolean) => void;
  readonly onMasterCreateWorkspaceChange: (checked: boolean) => void;
  readonly onImportChange: (userId: string, checked: boolean) => void;
  readonly onCreateWorkspaceChange: (userId: string, checked: boolean) => void;
  readonly onDeleteClick: (user: AdminUserRow) => void;
  readonly onEndReached: () => void;
};

export const AdminUsersMobileList = memo(function AdminUsersMobileList({
  sortedUsers,
  draftCaps,
  currentUserId,
  loadingMore,
  importMaster,
  createWorkspaceMaster,
  onMasterImportChange,
  onMasterCreateWorkspaceChange,
  onImportChange,
  onCreateWorkspaceChange,
  onDeleteClick,
  onEndReached,
}: AdminUsersMobileListProps) {
  return (
    <Stack gap="sm" className="admin-users-tab__mobile-list">
      <Paper withBorder radius="md" p="sm" className="admin-users-tab__mobile-master">
        <Text size="sm" fw={600} mb="xs">
          Bulk capabilities
        </Text>
        <Stack gap="sm">
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm">Import boards (all non-admins)</Text>
            <Checkbox
              checked={importMaster.checked}
              indeterminate={importMaster.indeterminate}
              onChange={(event) => onMasterImportChange(event.currentTarget.checked)}
              aria-label="Select all import boards"
            />
          </Group>
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm">Create workspace (all non-admins)</Text>
            <Checkbox
              checked={createWorkspaceMaster.checked}
              indeterminate={createWorkspaceMaster.indeterminate}
              onChange={(event) => onMasterCreateWorkspaceChange(event.currentTarget.checked)}
              aria-label="Select all create workspace"
            />
          </Group>
        </Stack>
      </Paper>

      <Box className="admin-users-tab__mobile-scroll">
        <Virtuoso
          className="admin-users-tab__mobile-virtuoso"
          style={{ height: '100%', minHeight: 0 }}
          data={sortedUsers}
          computeItemKey={(_index, user) => user._id}
          endReached={onEndReached}
          itemContent={(index, user) => {
            const draft = draftCaps[user._id] ?? {
              canImportBoards: user.canImportBoards,
              canCreateWorkspace: user.canCreateWorkspace,
            };
            return (
              <Box pb={index < sortedUsers.length - 1 ? 'sm' : 0}>
                <AdminUsersMobileCard
                  user={user}
                  draft={draft}
                  isCurrentUser={currentUserId != null && user._id === currentUserId}
                  onImportChange={onImportChange}
                  onCreateWorkspaceChange={onCreateWorkspaceChange}
                  onDeleteClick={onDeleteClick}
                />
              </Box>
            );
          }}
        />
        {loadingMore ? (
          <Group justify="center" className="admin-users-tab__mobile-footer" gap="xs">
            <Loader size="xs" />
            <Text size="xs" c="dimmed">
              Loading more users…
            </Text>
          </Group>
        ) : null}
      </Box>
    </Stack>
  );
});
