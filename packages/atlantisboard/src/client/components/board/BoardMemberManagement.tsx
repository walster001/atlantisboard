import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Menu,
  Modal,
  Paper,
  Stack,
  Text,
} from '@mantine/core';
import { IconFilter, IconX } from '@tabler/icons-react';
import { TableVirtuoso } from 'react-virtuoso';
import { BoardMemberEnterToSearchField } from './BoardMemberEnterToSearchField.js';
import { useBoardMemberManagement } from '../../hooks/board/useBoardMemberManagement.js';
import {
  BOARD_MEMBER_CURRENT_LIST_OVERSCAN,
  BOARD_MEMBER_TABLE_ROW_PX,
  BOARD_MEMBER_VIRTUOSO_OVERSCAN,
  BOARD_MEMBER_VIRTUOSO_VIEWPORT_PAD,
  boardMemberTableVirtuosoComponents,
  DirectoryUserTableRow,
  extractUser,
  MemberTableCells,
  OwnerTableCells,
} from './BoardMemberTableParts.js';
import './boardMemberManagement.css';

interface BoardMemberManagementProps {
  boardId: string;
}

export function BoardMemberManagement({ boardId }: BoardMemberManagementProps) {
  const {
    isMobileStackedLayout,
    canAddMember,
    canRemoveMember,
    canUpdateMemberRole,
    board,
    boardLoading,
    membersNextCursor,
    directoryQuery,
    setDirectoryQuery,
    directoryUsers,
    directoryLoading,
    discardPlaceholdersOpen,
    setDiscardPlaceholdersOpen,
    discardingPlaceholders,
    addRoles,
    roleOptions,
    memberFilterQuery,
    setMemberFilterQuery,
    memberRoleFilter,
    setMemberRoleFilter,
    membersLoadingMore,
    handleDirectoryEndReached,
    filteredMemberPanelRows,
    memberRoleFilterLabel,
    memberCount,
    hasUnmappedDirectoryPlaceholders,
    handleDiscardAllPlaceholders,
    handleDirectoryRoleChange,
    handleAddUser,
    handleRemoveMember,
    onMemberRoleChange,
    fetchNextMemberPage,
    handleMemberListEndReached,
  } = useBoardMemberManagement(boardId);

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
