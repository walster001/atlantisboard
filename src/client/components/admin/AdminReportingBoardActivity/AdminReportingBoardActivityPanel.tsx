import { memo, useState } from 'react';
import { Alert, Box, Button, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { Virtuoso } from 'react-virtuoso';
import { AdminReportingActivityCleanupModal } from '../AdminReportingActivityControls/AdminReportingActivityCleanupModal.js';
import { AdminReportingActivityControls } from '../AdminReportingActivityControls/AdminReportingActivityControls.js';
import type { AdminReportingDaysFilterControls } from '../AdminReportingActivityControls/useAdminReportingDaysFilter.js';
import type { AdminReportingBoardNameFilterControls } from '../AdminReportingActivityControls/useAdminReportingBoardNameFilter.js';
import { BoardActivityEntryRow } from '../../activities/boardActivityLogParts.js';
import { useAdminReportingBoardActivity } from './useAdminReportingBoardActivity.js';
import './adminReportingBoardActivity.css';

interface AdminReportingBoardActivityPanelProps {
  readonly boardNameFilter: AdminReportingBoardNameFilterControls;
  readonly daysFilter: AdminReportingDaysFilterControls;
}

export const AdminReportingBoardActivityPanel = memo(function AdminReportingBoardActivityPanel({
  boardNameFilter,
  daysFilter,
}: AdminReportingBoardActivityPanelProps) {
  const {
    boardFilterId,
    boardFilterLabel,
    boardOptions,
    loadingBoardOptions,
    handleBoardFilterSelect,
    clearBoardFilter,
  } = boardNameFilter;
  const { daysFilter: daysFilterValue, daysFilterOptions, handleDaysFilterChange } = daysFilter;
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const {
    rows,
    loading,
    loadingMore,
    error,
    handleEndReached,
    hasMore,
    refresh,
  } = useAdminReportingBoardActivity(boardFilterId, daysFilterValue);

  const emptyMessage =
    boardFilterId != null
      ? 'No board activity for this board.'
      : 'No board activity has been recorded yet.';

  return (
    <Stack gap="md" className="admin-reporting-board-activity">
      <Stack gap="sm">
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Title order={3}>Board Activity</Title>
          <Button variant="light" size="compact-sm" onClick={() => setCleanupOpen(true)}>
            Cleanup Old Records
          </Button>
        </Group>
        <Text size="sm" c="dimmed">
          Board content activity from every board in the application, newest first. Visible history
          respects each board&apos;s activity log retention setting.
        </Text>
        <AdminReportingActivityControls
          daysFilter={daysFilterValue}
          daysFilterOptions={daysFilterOptions}
          onDaysFilterChange={handleDaysFilterChange}
          boardFilterId={boardFilterId}
          boardFilterLabel={boardFilterLabel}
          boardOptions={boardOptions}
          loadingBoardOptions={loadingBoardOptions}
          onBoardFilterSelect={handleBoardFilterSelect}
          onClearBoardFilter={clearBoardFilter}
        />
      </Stack>

      {error != null ? (
        <Alert color="red" title="Could not load activity">
          {error}
        </Alert>
      ) : null}

      <Box className="admin-reporting-board-activity__surface">
        {loading ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        ) : rows.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="xl">
            {emptyMessage}
          </Text>
        ) : (
          <Virtuoso
            className="admin-reporting-board-activity__virtuoso"
            data={[...rows]}
            computeItemKey={(_, row) => `${row.boardId}:${row.id}`}
            defaultItemHeight={112}
            endReached={handleEndReached}
            itemContent={(_index, row) => (
              <BoardActivityEntryRow
                row={row}
                boardLabel={row.boardName}
              />
            )}
            components={{
              Footer: () =>
                loadingMore ? (
                  <Group justify="center" py="sm">
                    <Loader size="xs" />
                  </Group>
                ) : hasMore ? (
                  <Text size="xs" c="dimmed" ta="center" py="sm">
                    Scroll for more activity
                  </Text>
                ) : (
                  <Text size="xs" c="dimmed" ta="center" py="sm">
                    End of activity log
                  </Text>
                ),
            }}
          />
        )}
      </Box>

      <AdminReportingActivityCleanupModal
        kind="board"
        opened={cleanupOpen}
        onClose={() => {
          setCleanupOpen(false);
          refresh();
        }}
      />
    </Stack>
  );
});
