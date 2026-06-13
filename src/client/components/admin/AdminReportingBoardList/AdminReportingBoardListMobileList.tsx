import { memo } from 'react';
import { Box, Button, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { Virtuoso } from 'react-virtuoso';
import {
  formatBoardOwner,
  formatBoardVisibility,
  formatBoardWorkspace,
  formatReportingDateTime,
  type AdminBoardListRow,
} from './adminReportingBoardListUtils.js';

interface AdminReportingBoardListMobileListProps {
  readonly boards: readonly AdminBoardListRow[];
  readonly loadingMore: boolean;
  readonly deletingBoardId: string | null;
  readonly onEndReached: () => void;
  readonly onDeleteClick: (board: AdminBoardListRow) => void;
}

export const AdminReportingBoardListMobileList = memo(function AdminReportingBoardListMobileList({
  boards,
  loadingMore,
  deletingBoardId,
  onEndReached,
  onDeleteClick,
}: AdminReportingBoardListMobileListProps) {
  return (
    <Stack gap="sm" className="admin-reporting-board-list__mobile-list">
      <Box className="admin-reporting-board-list__mobile-scroll">
        <Virtuoso
          className="admin-reporting-board-list__mobile-virtuoso"
          style={{ height: '100%', minHeight: 0 }}
          data={boards}
          computeItemKey={(_index, board) => board._id}
          endReached={onEndReached}
          itemContent={(index, board) => (
            <Box pb={index < boards.length - 1 ? 'sm' : 0}>
              <Paper withBorder radius="md" p="sm" className="admin-reporting-board-list__mobile-card">
                <Stack gap={4}>
                  <Text fw={600} size="sm" lineClamp={2}>
                    {board.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Workspace: {formatBoardWorkspace(board)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Owner: {formatBoardOwner(board)}
                  </Text>
                  <Group gap="md" wrap="wrap">
                    <Text size="xs" c="dimmed">
                      Members: {board.memberCount}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Visibility: {formatBoardVisibility(board.visibility)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Position: {board.position}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    Created: {formatReportingDateTime(board.createdAt)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Updated: {formatReportingDateTime(board.updatedAt)}
                  </Text>
                  <Group justify="flex-end">
                    <Button
                      size="xs"
                      color="red"
                      variant="light"
                      loading={deletingBoardId === board._id}
                      disabled={deletingBoardId != null && deletingBoardId !== board._id}
                      onClick={() => {
                        onDeleteClick(board);
                      }}
                    >
                      Delete
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            </Box>
          )}
        />
        {loadingMore ? (
          <Group justify="center" className="admin-reporting-board-list__mobile-footer" gap="xs">
            <Loader size="xs" />
            <Text size="xs" c="dimmed">
              Loading more boards…
            </Text>
          </Group>
        ) : null}
      </Box>
    </Stack>
  );
});
