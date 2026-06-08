import { useMemo } from 'react';
import { Box, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { TableVirtuoso } from 'react-virtuoso';
import { useResponsiveTier } from '../../hooks/useResponsiveTier.js';
import { BoardMemberEnterToSearchField } from '../board/BoardMemberEnterToSearchField.js';
import { useBoardActivityEmailRoundupRecipients } from '../../hooks/activities/useBoardActivityEmailRoundupRecipients.js';
import {
  createRoundupTableComponents,
  RoundupDirectoryTableCells,
  RoundupRecipientTableCells,
} from './BoardActivityRoundupTableParts.js';
import {
  MEMBER_TABLE_ROW_PX,
  MEMBER_VIRTUOSO_OVERSCAN,
  MEMBER_VIRTUOSO_VIEWPORT_PAD,
} from '../members/shared/memberTableConstants.js';
import type { MemberUserRow } from '../../hooks/members/memberDirectoryUtils.js';
import '../board/boardMemberManagement.css';

interface BoardActivityEmailRoundupRecipientsProps {
  readonly boardId: string;
  readonly recipientUserIds: readonly string[];
  readonly onRecipientIdsChange: (ids: readonly string[]) => Promise<void>;
  readonly canEdit: boolean;
}

export function BoardActivityEmailRoundupRecipients({
  boardId,
  recipientUserIds,
  onRecipientIdsChange,
  canEdit,
}: BoardActivityEmailRoundupRecipientsProps) {
  const isMobileStackedLayout = useResponsiveTier() === 'mobile';
  const tableRowPx = isMobileStackedLayout ? 80 : MEMBER_TABLE_ROW_PX;

  const {
    directoryQuery,
    setDirectoryQuery,
    recipientFilterQuery,
    setRecipientFilterQuery,
    availableUsers,
    filteredRecipients,
    directoryLoading,
    directoryLoadingMore,
    recipientsLoading,
    handleDirectoryEndReached,
    handleAddRecipient,
    handleRemoveRecipient,
    recipientCount,
  } = useBoardActivityEmailRoundupRecipients(
    boardId,
    recipientUserIds,
    onRecipientIdsChange,
    canEdit,
  );

  const directoryTableComponents = useMemo(
    () => createRoundupTableComponents({ compactLayout: isMobileStackedLayout }),
    [isMobileStackedLayout],
  );

  const recipientsTableComponents = useMemo(
    () => createRoundupTableComponents({ compactLayout: isMobileStackedLayout }),
    [isMobileStackedLayout],
  );

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
          <Stack gap={isMobileStackedLayout ? 'xs' : 'md'} style={{ flexShrink: 0 }}>
            <Text fw={700} size={isMobileStackedLayout ? 'sm' : 'md'}>
              All Users
            </Text>
            <BoardMemberEnterToSearchField
              key={`roundup-dir-${boardId}`}
              ariaLabel="Search users to add as roundup recipients"
              placeholder="Search users to add..."
              onCommit={setDirectoryQuery}
            />
            <Text size="sm" c="dimmed">
              {canEdit
                ? 'Add board members or search for other users to receive the weekly roundup.'
                : 'You do not have permission to change roundup recipients.'}
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
            ) : availableUsers.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                {directoryQuery.trim() !== ''
                  ? 'No users match your search.'
                  : 'Everyone eligible is already receiving the roundup, or no users exist yet.'}
              </Text>
            ) : (
              <TableVirtuoso
                className="board-member-management__virtuoso-root"
                style={{ height: '100%', minHeight: 0, width: '100%', flex: 1 }}
                data={availableUsers}
                components={directoryTableComponents}
                computeItemKey={(_index, user) => user._id}
                fixedItemHeight={tableRowPx}
                increaseViewportBy={MEMBER_VIRTUOSO_VIEWPORT_PAD}
                overscan={MEMBER_VIRTUOSO_OVERSCAN}
                endReached={handleDirectoryEndReached}
                itemContent={(_index, user) => (
                  <RoundupDirectoryRow
                    user={user}
                    compactLayout={isMobileStackedLayout}
                    canEdit={canEdit}
                    onAdd={handleAddRecipient}
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
              Current Recipients ({recipientCount})
            </Text>
            <BoardMemberEnterToSearchField
              key={`roundup-rec-${boardId}`}
              ariaLabel="Search roundup recipients"
              placeholder="Search recipients..."
              onCommit={setRecipientFilterQuery}
            />
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
            {recipientsLoading ? (
              <Group justify="center" py="md">
                <Loader size="sm" />
              </Group>
            ) : filteredRecipients.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                {recipientFilterQuery.trim() !== ''
                  ? 'No recipients match your search.'
                  : 'No recipients selected yet. Add users from the left column.'}
              </Text>
            ) : (
              <TableVirtuoso
                className="board-member-management__virtuoso-root"
                style={{ height: '100%', minHeight: 0, width: '100%', flex: 1 }}
                data={filteredRecipients}
                components={recipientsTableComponents}
                computeItemKey={(_index, user) => user._id}
                fixedItemHeight={tableRowPx}
                increaseViewportBy={MEMBER_VIRTUOSO_VIEWPORT_PAD}
                overscan={MEMBER_VIRTUOSO_OVERSCAN}
                itemContent={(_index, user) => (
                  <RoundupRecipientRow
                    user={user}
                    compactLayout={isMobileStackedLayout}
                    canEdit={canEdit}
                    onRemove={handleRemoveRecipient}
                  />
                )}
              />
            )}
          </Box>
        </Paper>
      </div>
    </Box>
  );
}

function RoundupDirectoryRow(props: {
  readonly user: MemberUserRow;
  readonly compactLayout: boolean;
  readonly canEdit: boolean;
  readonly onAdd: (user: MemberUserRow) => void;
}) {
  const { user, compactLayout, canEdit, onAdd } = props;
  if (!canEdit) {
    return (
      <tr>
        <td className="board-member-management__td board-member-management__td--user" colSpan={2}>
          <Text size="sm" c="dimmed">
            {user.displayName || user.email}
          </Text>
        </td>
      </tr>
    );
  }
  return (
    <RoundupDirectoryTableCells
      user={user}
      compactLayout={compactLayout}
      onAdd={(row) => {
        void onAdd(row);
      }}
    />
  );
}

function RoundupRecipientRow(props: {
  readonly user: MemberUserRow;
  readonly compactLayout: boolean;
  readonly canEdit: boolean;
  readonly onRemove: (user: MemberUserRow) => void;
}) {
  const { user, compactLayout, canEdit, onRemove } = props;
  return (
    <RoundupRecipientTableCells
      user={user}
      compactLayout={compactLayout}
      canRemove={canEdit}
      onRemove={(row) => {
        void onRemove(row);
      }}
    />
  );
}
