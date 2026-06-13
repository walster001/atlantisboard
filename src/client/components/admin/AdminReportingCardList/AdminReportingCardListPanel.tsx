import { memo, useCallback } from 'react';
import { Alert, Box, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { TableVirtuoso } from 'react-virtuoso';
import { useResponsiveTier } from '../../../hooks/useResponsiveTier.js';
import { AdminReportingCardListMobileList } from './AdminReportingCardListMobileList.js';
import {
  AdminReportingCardListTableCells,
  AdminReportingCardListTableHeader,
  adminReportingCardListTableVirtuosoComponents,
} from './AdminReportingCardListTableParts.js';
import {
  ADMIN_CARD_LIST_ROW_PX,
  ADMIN_CARD_LIST_VIRTUOSO_OVERSCAN,
  ADMIN_CARD_LIST_VIRTUOSO_VIEWPORT_PAD,
} from './adminReportingCardListUtils.js';
import { useAdminReportingCardList } from './useAdminReportingCardList.js';
import './adminReportingCardList.css';

export const AdminReportingCardListPanel = memo(function AdminReportingCardListPanel() {
  const isMobile = useResponsiveTier() === 'mobile';
  const { rows, loading, loadingMore, error, handleEndReached } = useAdminReportingCardList();

  const renderFixedHeader = useCallback(() => <AdminReportingCardListTableHeader />, []);

  return (
    <Stack
      gap="md"
      className={
        isMobile
          ? 'admin-reporting-card-list admin-reporting-card-list--mobile'
          : 'admin-reporting-card-list'
      }
    >
      <Stack gap="xs">
        <Title order={3}>Card List</Title>
        <Text size="sm" c="dimmed">
          All cards across every board in the application, newest first. Card descriptions are
          excluded from this report.
        </Text>
      </Stack>

      {error != null ? (
        <Alert color="red" title="Could not load cards">
          {error}
        </Alert>
      ) : null}

      <Paper
        withBorder
        radius="md"
        p="sm"
        className={
          isMobile
            ? 'admin-reporting-card-list__table-panel admin-reporting-card-list__table-panel--mobile'
            : 'admin-reporting-card-list__table-panel'
        }
      >
        {loading ? (
          <Group justify="center" py="lg">
            <Loader size="sm" />
          </Group>
        ) : rows.length === 0 ? (
          <Text c="dimmed" ta="center" py="md">
            No cards found.
          </Text>
        ) : isMobile ? (
          <AdminReportingCardListMobileList
            rows={rows}
            loadingMore={loadingMore}
            onEndReached={handleEndReached}
          />
        ) : (
          <Box className="admin-reporting-card-list__table-scroll">
            <TableVirtuoso
              className="admin-reporting-card-list__virtuoso-root"
              style={{ height: '100%', minHeight: 0, width: '100%', flex: 1 }}
              data={[...rows]}
              components={adminReportingCardListTableVirtuosoComponents}
              computeItemKey={(_index, row) => row._id}
              fixedItemHeight={ADMIN_CARD_LIST_ROW_PX}
              increaseViewportBy={ADMIN_CARD_LIST_VIRTUOSO_VIEWPORT_PAD}
              overscan={ADMIN_CARD_LIST_VIRTUOSO_OVERSCAN}
              endReached={handleEndReached}
              fixedHeaderContent={renderFixedHeader}
              itemContent={(index, row) => (
                <AdminReportingCardListTableCells rowIndex={index} row={row} />
              )}
            />
            {loadingMore ? (
              <Group justify="center" className="admin-reporting-card-list__table-footer" gap="xs">
                <Loader size="xs" />
                <Text size="xs" c="dimmed">
                  Loading more cards…
                </Text>
              </Group>
            ) : null}
          </Box>
        )}
      </Paper>
    </Stack>
  );
});
