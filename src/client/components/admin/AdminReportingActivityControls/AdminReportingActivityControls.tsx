import { Group, Select, Text } from '@mantine/core';
import { memo } from 'react';
import { AdminReportingBoardNameFilter } from './AdminReportingBoardNameFilter.js';

interface AdminReportingActivityControlsProps {
  readonly retentionAriaLabel: string;
  readonly retentionValue: string;
  readonly retentionSelectData: ReadonlyArray<{ value: string; label: string }>;
  readonly savingRetention: boolean;
  readonly onRetentionChange: (value: string | null) => void;
  readonly boardFilterId: string | null;
  readonly boardFilterLabel: string | null;
  readonly boardOptions: readonly { readonly value: string; readonly label: string }[];
  readonly loadingBoardOptions: boolean;
  readonly onBoardFilterSelect: (boardId: string) => void;
  readonly onClearBoardFilter: () => void;
}

export const AdminReportingActivityControls = memo(function AdminReportingActivityControls({
  retentionAriaLabel,
  retentionValue,
  retentionSelectData,
  savingRetention,
  onRetentionChange,
  boardFilterId,
  boardFilterLabel,
  boardOptions,
  loadingBoardOptions,
  onBoardFilterSelect,
  onClearBoardFilter,
}: AdminReportingActivityControlsProps) {
  return (
    <Group justify="flex-start" align="center" wrap="wrap" gap="lg">
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
          Retention
        </Text>
        <Select
          aria-label={retentionAriaLabel}
          data={[...retentionSelectData]}
          value={retentionValue}
          onChange={(value) => {
            void onRetentionChange(value);
          }}
          disabled={savingRetention}
          w={{ base: '100%', sm: 200 }}
          miw={160}
        />
      </Group>
    </Group>
  );
});
