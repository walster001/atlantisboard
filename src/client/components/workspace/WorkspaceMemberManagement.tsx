import { Box, Group, Loader, Paper, Text } from '@mantine/core';
import { TableVirtuoso } from 'react-virtuoso';
import { useWorkspaceMemberManagement } from '../../hooks/workspace/useWorkspaceMemberManagement.js';
import { defaultMemberTableVirtuosoComponents } from '../members/shared/memberTableVirtuoso.js';
import {
  MEMBER_DIRECTORY_OVERSCAN,
  MEMBER_LIST_OVERSCAN,
  MEMBER_TABLE_ROW_PX,
  MEMBER_VIRTUOSO_VIEWPORT_PAD,
} from '../members/shared/memberTableConstants.js';
import { BoardMemberEnterToSearchField } from '../board/BoardMemberEnterToSearchField.js';
import {
  WorkspaceDirectoryUserCells,
  WorkspaceMemberPanelMemberCells,
  WorkspaceMemberPanelOwnerCells,
} from './WorkspaceMemberTableParts.js';
import { canAddUserById, workspaceMemberPanelRowKey } from './workspaceMemberTypes.js';
import '../board/boardMemberManagement.css';

const workspaceMemberTableVirtuosoComponents = defaultMemberTableVirtuosoComponents;

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
  const {
    workspaceLoading,
    owner,
    filteredMembers,
    directoryUsers,
    directoryLoading,
    directoryLoadingMore,
    addRoles,
    roleOptions,
    directoryQuery,
    memberPanelRows,
    ownerIdRef,
    membersRef,
    setDirectoryQuery,
    setMemberFilterQuery,
    handleDirectoryEndReached,
    handleAddUser,
    handleRemoveUser,
    handleUpdateRole,
    handleDirectoryRoleChange,
  } = useWorkspaceMemberManagement({
    workspaceId,
    canAddMembers,
    canRemoveMembers,
    canUpdateMemberRoles,
  });

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
          ) : directoryUsers.length === 0 ? (
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
              fixedItemHeight={MEMBER_TABLE_ROW_PX}
              increaseViewportBy={MEMBER_VIRTUOSO_VIEWPORT_PAD}
              overscan={MEMBER_DIRECTORY_OVERSCAN}
              endReached={handleDirectoryEndReached}
              itemContent={(_index, user) => (
                <WorkspaceDirectoryUserCells
                  user={user}
                  role={addRoles[user._id] ?? 'viewer'}
                  roleOptions={roleOptions}
                  canAdd={canAddUserById(membersRef.current, ownerIdRef.current, user._id)}
                  canAddMembers={canAddMembers}
                  canUpdateMemberRoles={canUpdateMemberRoles}
                  onRoleChange={handleDirectoryRoleChange}
                  onAdd={handleAddUser}
                />
              )}
            />
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
              fixedItemHeight={MEMBER_TABLE_ROW_PX}
              increaseViewportBy={MEMBER_VIRTUOSO_VIEWPORT_PAD}
              overscan={MEMBER_LIST_OVERSCAN}
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
