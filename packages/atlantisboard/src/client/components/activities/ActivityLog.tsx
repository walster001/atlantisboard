import { Alert, Box, Button, Card, Group, Loader, Select, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import {
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconHistory,
} from '@tabler/icons-react';
import { Virtuoso } from 'react-virtuoso';
import type { BoardSettingsLivePatch } from '../../store/database.js';
import { useActivityLog } from '../../hooks/activities/useActivityLog.js';
import { ActivityLogEntryRow } from './activityLogParts.js';
import './activityLog.css';

interface ActivityLogProps {
  boardId: string;
  onSettingsLivePatch?: (patch: BoardSettingsLivePatch) => void;
  mobileLayout?: boolean;
}

export function ActivityLog({ boardId, onSettingsLivePatch, mobileLayout = false }: ActivityLogProps) {
  const {
    forbidden,
    loading,
    activities,
    totalForDay,
    selectedDayIndex,
    setSelectedDayIndex,
    retentionValue,
    savingRetention,
    retentionSelectData,
    handleRetentionChange,
    resolveRoleLabel,
    dayPagesTotal,
    canGoNewer,
    canGoOlder,
    dayLabel,
  } = useActivityLog(boardId, onSettingsLivePatch);

  if (forbidden) {
    return (
      <Alert color="yellow" title="No access">
        Only board admins and managers can view the member activity log.
      </Alert>
    );
  }

  return (
    <Box
      className={
        mobileLayout
          ? 'board-member-activity-log board-member-activity-log--mobile'
          : 'board-member-activity-log'
      }
    >
      <Group className="board-member-activity-log__header" gap="sm" align="flex-start" wrap="nowrap">
        <ThemeIcon size="lg" radius="md" variant="light" color="blue" aria-hidden>
          <IconHistory size={22} stroke={1.5} />
        </ThemeIcon>
        <Stack gap={2}>
          <Title order={4}>Member Activity Log</Title>
          <Text size="sm" c="dimmed">
            Track who added, removed, or changed roles for board members
          </Text>
        </Stack>
      </Group>

      <Box className="board-member-activity-log__surface">
        <Card
          className="board-member-activity-log__card board-member-activity-log__retention"
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
              aria-label="Member activity log retention"
              data={retentionSelectData}
              value={retentionValue}
              onChange={(v) => {
                void handleRetentionChange(v);
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
              ? 'board-member-activity-log__scroll board-member-activity-log__scroll--center'
              : 'board-member-activity-log__scroll board-member-activity-log__virtuoso-host'
          }
        >
          {loading ? (
            <Group justify="center" py="md">
              <Loader size="sm" />
            </Group>
          ) : totalForDay === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="lg">
              No member activity on {dayLabel}.
            </Text>
          ) : (
            <Virtuoso
              className="board-member-activity-log__virtuoso"
              style={{ flex: 1, minHeight: 200 }}
              data={activities}
              computeItemKey={(_, row) => row.id}
              defaultItemHeight={96}
              itemContent={(_index, row) => (
                <ActivityLogEntryRow row={row} resolveRoleLabel={resolveRoleLabel} />
              )}
            />
          )}
        </Box>

        <Group
          className="board-member-activity-log__footer"
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
