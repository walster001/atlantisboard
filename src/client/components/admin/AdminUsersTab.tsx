import { memo, useCallback } from 'react';
import { Alert, Box, Button, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { TableVirtuoso } from 'react-virtuoso';
import { BoardMemberEnterToSearchField } from '../board/BoardMemberEnterToSearchField.js';
import { useResponsiveTier } from '../../hooks/useResponsiveTier.js';
import {
  AdminUserTableCells,
  AdminUsersTableHeader,
  adminUsersTableVirtuosoComponents,
} from './AdminUsersTableParts.js';
import { AdminUsersDeleteModal } from './AdminUsersDeleteModal.js';
import { AdminUsersMobileList } from './AdminUsersMobileList.js';
import {
  ADMIN_USER_ROW_PX,
  ADMIN_USER_VIRTUOSO_OVERSCAN,
  ADMIN_USER_VIRTUOSO_VIEWPORT_PAD,
} from './adminUsersTabUtils.js';
import { useAdminUsersTab } from './useAdminUsersTab.js';
import './adminUsersTab.css';

interface AdminUsersTabProps {
  readonly currentUserId?: string;
}

export const AdminUsersTab = memo(function AdminUsersTab(props: AdminUsersTabProps) {
  const { currentUserId } = props;
  const isMobile = useResponsiveTier() === 'mobile';
  const {
    draftCaps,
    loading,
    loadingMore,
    savingCaps,
    setQuery,
    error,
    confirmDeleteUser,
    setConfirmDeleteUser,
    deletingUserId,
    sortedUsers,
    hasUnsavedCapabilityChanges,
    importMaster,
    createWorkspaceMaster,
    setMasterCapability,
    handleSaveCapabilities,
    handleDeleteConfirmed,
    handleImportChange,
    handleCreateWorkspaceChange,
    handleDeleteClick,
    handleEndReached,
  } = useAdminUsersTab();

  const renderFixedHeader = useCallback(
    () => (
      <AdminUsersTableHeader
        importMaster={importMaster}
        createWorkspaceMaster={createWorkspaceMaster}
        onMasterImportChange={(checked) => setMasterCapability('canImportBoards', checked)}
        onMasterCreateWorkspaceChange={(checked) => setMasterCapability('canCreateWorkspace', checked)}
      />
    ),
    [importMaster, createWorkspaceMaster, setMasterCapability],
  );

  return (
    <Stack gap="md" className={isMobile ? 'admin-users-tab admin-users-tab--mobile' : 'admin-users-tab'}>
      <Group justify="space-between" align="end" wrap="wrap">
        <Box>
          <Text fw={700} size="lg">
            Users
          </Text>
          <Text size="sm" c="dimmed">
            View and manage all application users.
          </Text>
        </Box>
        <Group align="end" wrap={isMobile ? 'wrap' : 'nowrap'}>
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

      <Paper
        withBorder
        radius="md"
        p="sm"
        className={
          isMobile
            ? 'admin-users-tab__table-panel admin-users-tab__table-panel--mobile'
            : 'admin-users-tab__table-panel'
        }
      >
        {loading ? (
          <Group justify="center" py="lg">
            <Loader size="sm" />
          </Group>
        ) : sortedUsers.length === 0 ? (
          <Text c="dimmed" ta="center" py="md">
            No users found.
          </Text>
        ) : isMobile ? (
          <AdminUsersMobileList
            sortedUsers={sortedUsers}
            draftCaps={draftCaps}
            currentUserId={currentUserId}
            loadingMore={loadingMore}
            importMaster={importMaster}
            createWorkspaceMaster={createWorkspaceMaster}
            onMasterImportChange={(checked) => setMasterCapability('canImportBoards', checked)}
            onMasterCreateWorkspaceChange={(checked) => setMasterCapability('canCreateWorkspace', checked)}
            onImportChange={handleImportChange}
            onCreateWorkspaceChange={handleCreateWorkspaceChange}
            onDeleteClick={handleDeleteClick}
            onEndReached={handleEndReached}
          />
        ) : (
          <Box className="admin-users-tab__table-scroll">
            <TableVirtuoso
              className="admin-users-tab__virtuoso-root"
              style={{ height: '100%', minHeight: 0, width: '100%', flex: 1 }}
              data={sortedUsers}
              components={adminUsersTableVirtuosoComponents}
              computeItemKey={(_index, user) => user._id}
              fixedItemHeight={ADMIN_USER_ROW_PX}
              increaseViewportBy={ADMIN_USER_VIRTUOSO_VIEWPORT_PAD}
              overscan={ADMIN_USER_VIRTUOSO_OVERSCAN}
              endReached={handleEndReached}
              fixedHeaderContent={renderFixedHeader}
              itemContent={(index, user) => {
                const draft = draftCaps[user._id] ?? {
                  canImportBoards: user.canImportBoards,
                  canCreateWorkspace: user.canCreateWorkspace,
                };
                return (
                  <AdminUserTableCells
                    rowIndex={index}
                    user={user}
                    draft={draft}
                    isCurrentUser={currentUserId != null && user._id === currentUserId}
                    onImportChange={handleImportChange}
                    onCreateWorkspaceChange={handleCreateWorkspaceChange}
                    onDeleteClick={handleDeleteClick}
                  />
                );
              }}
            />
            {loadingMore ? (
              <Group justify="center" className="admin-users-tab__table-footer" gap="xs">
                <Loader size="xs" />
                <Text size="xs" c="dimmed">
                  Loading more users…
                </Text>
              </Group>
            ) : null}
          </Box>
        )}
      </Paper>

      <AdminUsersDeleteModal
        confirmDeleteUser={confirmDeleteUser}
        deletingUserId={deletingUserId}
        onClose={() => setConfirmDeleteUser(null)}
        onConfirm={() => {
          void handleDeleteConfirmed();
        }}
      />
    </Stack>
  );
});
