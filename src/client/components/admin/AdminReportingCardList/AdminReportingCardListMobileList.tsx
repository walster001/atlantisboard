import { memo } from 'react';
import { Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { Virtuoso } from 'react-virtuoso';
import {
  formatAssigneeSummary,
  formatCardDueDates,
  formatLabelCount,
  formatReportingDateTime,
  type AdminReportingCardListRow,
} from './adminReportingCardListUtils.js';

interface AdminReportingCardListMobileListProps {
  readonly rows: readonly AdminReportingCardListRow[];
  readonly loadingMore: boolean;
  readonly onEndReached: () => void;
}

export const AdminReportingCardListMobileList = memo(function AdminReportingCardListMobileList({
  rows,
  loadingMore,
  onEndReached,
}: AdminReportingCardListMobileListProps) {
  return (
    <Virtuoso
      className="admin-reporting-card-list__mobile-virtuoso"
      data={[...rows]}
      computeItemKey={(_, row) => row._id}
      endReached={onEndReached}
      itemContent={(_index, row) => (
        <Paper withBorder radius="md" p="sm" className="admin-reporting-card-list__mobile-card">
          <Stack gap={4}>
            <Text size="sm" fw={600} lineClamp={2}>
              {row.title}
            </Text>
            <Text size="xs" c="dimmed">
              {row.boardName}
            </Text>
            <Text size="xs" c="dimmed">
              {row.listName}
            </Text>
            <Text size="xs">{formatCardDueDates(row)}</Text>
            <Group gap="md">
              <Text size="xs">Assignees: {formatAssigneeSummary(row)}</Text>
              <Text size="xs">Labels: {formatLabelCount(row)}</Text>
            </Group>
            <Text size="xs" c="dimmed">
              Created {formatReportingDateTime(row.createdAt)} · Updated{' '}
              {formatReportingDateTime(row.updatedAt)}
            </Text>
          </Stack>
        </Paper>
      )}
      components={{
        Footer: () =>
          loadingMore ? (
            <Group justify="center" py="sm">
              <Loader size="xs" />
            </Group>
          ) : null,
      }}
    />
  );
});
