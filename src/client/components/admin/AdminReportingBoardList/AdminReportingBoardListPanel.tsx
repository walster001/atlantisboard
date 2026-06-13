import { memo, useCallback } from 'react';
import { Alert, Box, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { TableVirtuoso } from 'react-virtuoso';
import { useResponsiveTier } from '../../../hooks/useResponsiveTier.js';
import { AdminReportingBoardListDeleteModal } from './AdminReportingBoardListDeleteModal.js';
import { AdminReportingBoardListMobileList } from './AdminReportingBoardListMobileList.js';
import {
  AdminBoardListTableCells,
  AdminBoardListTableHeader,
  adminBoardListTableVirtuosoComponents,
} from './AdminReportingBoardListTableParts.js';
import {
  ADMIN_BOARD_LIST_ROW_PX,
  ADMIN_BOARD_LIST_VIRTUOSO_OVERSCAN,
  ADMIN_BOARD_LIST_VIRTUOSO_VIEWPORT_PAD,
} from './adminReportingBoardListUtils.js';
import { useAdminReportingBoardList } from './useAdminReportingBoardList.js';
import { useAdminReportingBoardListMasterDelete } from './useAdminReportingBoardListMasterDelete.js';
import './adminReportingBoardList.css';

export const AdminReportingBoardListPanel = memo(function AdminReportingBoardListPanel() {
  const isMobile = useResponsiveTier() === 'mobile';
  const { boards, loading, loadingMore, error, handleEndReached, removeBoard } =
    useAdminReportingBoardList();
  const {
    confirmDeleteBoard,
    deletingBoardId,
    handleDeleteClick,
    handleDeleteClose,
    handleDeleteConfirmed,
  } = useAdminReportingBoardListMasterDelete({ onBoardDeleted: removeBoard });

  const renderFixedHeader = useCallback(() => <AdminBoardListTableHeader />, []);

  return (
    <Stack
      gap="md"
      className={
        isMobile
          ? 'admin-reporting-board-list admin-reporting-board-list--mobile'
          : 'admin-reporting-board-list'
      }
    >
      <Stack gap="sm">
        <Title order={3}>Board List</Title>
        <Text size="sm" c="dimmed">
          All boards in the application, newest first. Use master delete to remove rogue or
          unauthorized boards.
        </Text>
      </Stack>

      {error != null ? (
        <Alert color="red" title="Could not load board list">
          {error}
        </Alert>
      ) : null}

      <Paper
        withBorder
        radius="md"
        p="sm"
        className={
          isMobile
            ? 'admin-reporting-board-list__table-panel admin-reporting-board-list__table-panel--mobile'
            : 'admin-reporting-board-list__table-panel'
        }
      >
        {loading ? (
          <Group justify="center" py="lg">
            <Loader size="sm" />
          </Group>
        ) : boards.length === 0 ? (
          <Text c="dimmed" ta="center" py="md">
            No boards found.
          </Text>
        ) : isMobile ? (
          <AdminReportingBoardListMobileList
            boards={boards}
            loadingMore={loadingMore}
            deletingBoardId={deletingBoardId}
            onEndReached={handleEndReached}
            onDeleteClick={handleDeleteClick}
          />
        ) : (
          <Box className="admin-reporting-board-list__table-scroll">
            <TableVirtuoso
              className="admin-reporting-board-list__virtuoso-root"
              style={{ height: '100%', minHeight: 0, width: '100%', flex: 1 }}
              data={boards}
              components={adminBoardListTableVirtuosoComponents}
              computeItemKey={(_index, board) => board._id}
              fixedItemHeight={ADMIN_BOARD_LIST_ROW_PX}
              increaseViewportBy={ADMIN_BOARD_LIST_VIRTUOSO_VIEWPORT_PAD}
              overscan={ADMIN_BOARD_LIST_VIRTUOSO_OVERSCAN}
              endReached={handleEndReached}
              fixedHeaderContent={renderFixedHeader}
              itemContent={(index, board) => (
                <AdminBoardListTableCells
                  rowIndex={index}
                  board={board}
                  deletingBoardId={deletingBoardId}
                  onDeleteClick={handleDeleteClick}
                />
              )}
            />
            {loadingMore ? (
              <Group justify="center" className="admin-reporting-board-list__table-footer" gap="xs">
                <Loader size="xs" />
                <Text size="xs" c="dimmed">
                  Loading more boards…
                </Text>
              </Group>
            ) : null}
          </Box>
        )}
      </Paper>

      <AdminReportingBoardListDeleteModal
        confirmDeleteBoard={confirmDeleteBoard}
        deletingBoardId={deletingBoardId}
        onClose={handleDeleteClose}
        onConfirm={() => {
          void handleDeleteConfirmed();
        }}
      />
    </Stack>
  );
});
