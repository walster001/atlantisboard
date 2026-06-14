import { memo, useState } from 'react';
import { Alert, Box, Button, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { Virtuoso } from 'react-virtuoso';
import { AdminReportingActivityCleanupModal } from '../AdminReportingActivityControls/AdminReportingActivityCleanupModal.js';
import { AdminReportingActivityControls } from '../AdminReportingActivityControls/AdminReportingActivityControls.js';
import type { AdminReportingDaysFilterControls } from '../AdminReportingActivityControls/useAdminReportingDaysFilter.js';
import type { AdminReportingBoardNameFilterControls } from '../AdminReportingActivityControls/useAdminReportingBoardNameFilter.js';
import { MemberAuditEntryRow } from '../../activities/memberAuditLogParts.js';
import { useAdminReportingMemberActivity } from './useAdminReportingMemberActivity.js';
import './adminReportingMemberActivity.css';

interface AdminReportingMemberActivityPanelProps {
  readonly boardNameFilter: AdminReportingBoardNameFilterControls;
  readonly daysFilter: AdminReportingDaysFilterControls;
}

export const AdminReportingMemberActivityPanel = memo(function AdminReportingMemberActivityPanel({
  boardNameFilter,
  daysFilter,
}: AdminReportingMemberActivityPanelProps) {
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
    resolveRoleLabel,
    handleEndReached,
    hasMore,
    refresh,
  } = useAdminReportingMemberActivity(boardFilterId, daysFilterValue);

  const emptyMessage =
    boardFilterId != null
      ? 'No member activity for this board.'
      : 'No member activity has been recorded yet.';

  return (
    <Stack gap="md" className="admin-reporting-member-activity">
      <Stack gap="sm">
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Title order={3}>Member Activity</Title>
          <Button variant="light" size="compact-sm" onClick={() => setCleanupOpen(true)}>
            Cleanup Old Records
          </Button>
        </Group>
        <Text size="sm" c="dimmed">
          Member audit events from every board in the application, newest first. Visible history
          respects each board&apos;s member audit retention setting.
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

      <Box className="admin-reporting-member-activity__surface">
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
            className="admin-reporting-member-activity__virtuoso"
            data={[...rows]}
            computeItemKey={(_, row) => `${row.boardId}:${row.id}`}
            defaultItemHeight={112}
            endReached={handleEndReached}
            itemContent={(_index, row) => (
              <MemberAuditEntryRow
                row={row}
                resolveRoleLabel={resolveRoleLabel}
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
        kind="member"
        opened={cleanupOpen}
        onClose={() => {
          setCleanupOpen(false);
          refresh();
        }}
      />
    </Stack>
  );
});
