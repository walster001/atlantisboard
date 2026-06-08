import type { ReactNode } from 'react';
import { Box, Button, Card, Group, Loader, Select, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconClock } from '@tabler/icons-react';
import { Virtuoso } from 'react-virtuoso';
import './boardDayLog.css';

export interface BoardDayLogPanelProps<TRow extends { readonly id: string }> {
  readonly mobileLayout?: boolean;
  readonly header: ReactNode;
  readonly headerControls?: ReactNode;
  readonly retentionAriaLabel: string;
  readonly retentionSelectData: ReadonlyArray<{ value: string; label: string }>;
  readonly retentionValue: string;
  readonly savingRetention: boolean;
  readonly onRetentionChange: (value: string | null) => void | Promise<void>;
  readonly loading: boolean;
  readonly totalForDay: number;
  readonly activities: readonly TRow[];
  readonly emptyMessage: string;
  readonly renderRow: (row: TRow) => ReactNode;
  readonly selectedDayIndex: number;
  readonly setSelectedDayIndex: (updater: (index: number) => number) => void;
  readonly dayPagesTotal: number;
  readonly canGoNewer: boolean;
  readonly canGoOlder: boolean;
  readonly dayLabel: string;
  readonly defaultItemHeight?: number;
}

export function BoardDayLogPanel<TRow extends { readonly id: string }>({
  mobileLayout = false,
  header,
  headerControls,
  retentionAriaLabel,
  retentionSelectData,
  retentionValue,
  savingRetention,
  onRetentionChange,
  loading,
  totalForDay,
  activities,
  emptyMessage,
  renderRow,
  selectedDayIndex,
  setSelectedDayIndex,
  dayPagesTotal,
  canGoNewer,
  canGoOlder,
  dayLabel,
  defaultItemHeight = 96,
}: BoardDayLogPanelProps<TRow>) {
  return (
    <Box className={mobileLayout ? 'board-day-log board-day-log--mobile' : 'board-day-log'}>
      <Box className="board-day-log__header">{header}</Box>
      {headerControls != null ? (
        <Box className="board-day-log__header-controls">{headerControls}</Box>
      ) : null}

      <Box className="board-day-log__surface">
        <Card
          className="board-day-log__card board-day-log__retention"
          padding="md"
          radius="md"
          withBorder
          shadow="none"
        >
          <Group justify="space-between" align="center" wrap="nowrap" gap="md">
            <Group gap="md" wrap="nowrap" align="flex-start">
              <ThemeIcon size="lg" radius="md" variant="light" color="gray" aria-hidden>
                <IconClock size={20} stroke={1.5} />
              </ThemeIcon>
              <Stack gap={2}>
                <Text fw={600} size="sm">
                  Log Retention
                </Text>
                {!mobileLayout ? (
                  <Text size="xs" c="dimmed">
                    Automatically delete old entries to manage database size
                  </Text>
                ) : null}
              </Stack>
            </Group>
            <Select
              aria-label={retentionAriaLabel}
              data={[...retentionSelectData]}
              value={retentionValue}
              onChange={(v) => {
                void onRetentionChange(v);
              }}
              disabled={savingRetention}
              w={{ base: '100%', sm: 200 }}
              miw={160}
            />
          </Group>
        </Card>

        <Box
          className={
            loading
              ? 'board-day-log__scroll board-day-log__scroll--center'
              : 'board-day-log__scroll board-day-log__virtuoso-host'
          }
        >
          {loading ? (
            <Group justify="center" py="md">
              <Loader size="sm" />
            </Group>
          ) : totalForDay === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="lg">
              {emptyMessage}
            </Text>
          ) : (
            <Virtuoso
              className="board-day-log__virtuoso"
              style={{ flex: 1, minHeight: 200 }}
              data={[...activities]}
              computeItemKey={(_, row) => row.id}
              defaultItemHeight={defaultItemHeight}
              itemContent={(_index, row) => renderRow(row)}
            />
          )}
        </Box>

        <Group
          className="board-day-log__footer"
          justify="space-between"
          align="center"
          wrap="wrap"
          gap="sm"
        >
          <Text size="sm" c="dimmed">
            Day {selectedDayIndex + 1} of {dayPagesTotal} · {dayLabel} · {totalForDay}{' '}
            {totalForDay === 1 ? 'entry' : 'entries'}
          </Text>
          <Group gap="xs" wrap="nowrap">
            <Button
              type="button"
              variant="default"
              size="sm"
              leftSection={<IconChevronLeft size={16} stroke={1.75} aria-hidden />}
              disabled={!canGoNewer || loading}
              onClick={() => {
                setSelectedDayIndex((i) => Math.max(0, i - 1));
              }}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              rightSection={<IconChevronRight size={16} stroke={1.75} aria-hidden />}
              disabled={!canGoOlder || loading || dayPagesTotal === 0}
              onClick={() => {
                setSelectedDayIndex((i) => Math.min(dayPagesTotal - 1, i + 1));
              }}
            >
              Next
            </Button>
          </Group>
        </Group>
      </Box>
    </Box>
  );
}
