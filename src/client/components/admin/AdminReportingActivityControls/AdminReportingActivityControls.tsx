import { Group, Select, Text } from '@mantine/core';
import { memo } from 'react';
import type { AdminReportingDaysFilterValue } from '../../../../shared/constants/adminReporting.js';
import { AdminReportingBoardNameFilter } from './AdminReportingBoardNameFilter.js';

interface AdminReportingActivityControlsProps {
  readonly daysFilter: AdminReportingDaysFilterValue;
  readonly daysFilterOptions: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  readonly onDaysFilterChange: (value: string | null) => void;
  readonly boardFilterId: string | null;
  readonly boardFilterLabel: string | null;
  readonly boardOptions: readonly { readonly value: string; readonly label: string }[];
  readonly loadingBoardOptions: boolean;
  readonly onBoardFilterSelect: (boardId: string) => void;
  readonly onClearBoardFilter: () => void;
}

export const AdminReportingActivityControls = memo(function AdminReportingActivityControls({
  daysFilter,
  daysFilterOptions,
  onDaysFilterChange,
  boardFilterId,
  boardFilterLabel,
  boardOptions,
  loadingBoardOptions,
  onBoardFilterSelect,
  onClearBoardFilter,
}: AdminReportingActivityControlsProps) {
  return (
    <Group
      justify="flex-start"
      align="center"
      wrap="wrap"
      gap="lg"
      className="admin-reporting-activity-controls"
    >
      <AdminReportingBoardNameFilter
        boardFilterId={boardFilterId}
        boardFilterLabel={boardFilterLabel}
        boardOptions={boardOptions}
        loadingOptions={loadingBoardOptions}
        onBoardFilterSelect={onBoardFilterSelect}
        onClearBoardFilter={onClearBoardFilter}
      />
      <Group gap="sm" align="center" wrap="nowrap">
        <Text fw={600} size="sm">
          Days
        </Text>
        <Select
          aria-label="Activity report days filter"
          data={[...daysFilterOptions]}
          value={daysFilter}
          onChange={onDaysFilterChange}
          w={{ base: '100%', sm: 200 }}
          miw={160}
        />
      </Group>
    </Group>
  );
});
