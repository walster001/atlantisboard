import { useState } from 'react';
import { ActionIcon, Alert, Badge, Group, Stack, Switch, Text, ThemeIcon, Title, Tooltip } from '@mantine/core';
import { IconHeartRateMonitor, IconSettings } from '@tabler/icons-react';
import type { BoardSettingsLivePatch } from '../../store/database.js';
import { useBoardPermissions } from '../../hooks/useBoardPermissions.js';
import { BoardDayLogPanel } from '../board-logs/BoardDayLogPanel.js';
import { useBoardActivityLog } from '../../hooks/activities/useBoardActivityLog.js';
import { BoardActivityEntryRow } from './boardActivityLogParts.js';
import { BoardActivityTrackingModal } from './BoardActivityTrackingModal.js';

interface BoardActivityLogProps {
  boardId: string;
  onSettingsLivePatch?: (patch: BoardSettingsLivePatch) => void;
  mobileLayout?: boolean;
}

export function BoardActivityLog({ boardId, onSettingsLivePatch, mobileLayout = false }: BoardActivityLogProps) {
  const { can, loaded: permissionsLoaded } = useBoardPermissions(boardId);
  const canEditSettings = permissionsLoaded && can('boards.settings.update');
  const [trackingModalOpen, setTrackingModalOpen] = useState(false);

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
    dayPagesTotal,
    canGoNewer,
    canGoOlder,
    dayLabel,
    activityLogEnabled,
    activityLogTracking,
    savingEnabled,
    handleEnabledChange,
    handleTrackingSave,
  } = useBoardActivityLog(boardId, onSettingsLivePatch);

  if (forbidden) {
    return (
      <Alert color="yellow" title="No access">
        You do not have permission to view the board activity log.
      </Alert>
    );
  }

  const emptyMessage = activityLogEnabled
    ? `No board activity on ${dayLabel}.`
    : `Activity logging is disabled. Enable it to record board changes.`;

  return (
    <>
      <BoardDayLogPanel
        mobileLayout={mobileLayout}
        header={
          <Group gap="sm" align="flex-start" wrap="nowrap">
            <ThemeIcon size="lg" radius="md" variant="light" color="teal" aria-hidden>
              <IconHeartRateMonitor size={22} stroke={1.5} />
            </ThemeIcon>
            <Stack gap={2}>
              <Title order={4}>Activity Log</Title>
              <Text size="sm" c="dimmed">
                Track create, update, move, and delete actions on this board
              </Text>
            </Stack>
          </Group>
        }
        headerControls={
          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <Group gap="sm" wrap="nowrap" align="center">
              <Switch
                label="Activity log enabled"
                checked={activityLogEnabled}
                disabled={!canEditSettings || savingEnabled}
                onChange={(event) => {
                  void handleEnabledChange(event.currentTarget.checked);
                }}
              />
              {!activityLogEnabled ? (
                <Badge size="sm" variant="light" color="gray">
                  Logging off
                </Badge>
              ) : null}
            </Group>
            <Tooltip label="Configure tracked categories" withArrow>
              <ActionIcon
                type="button"
                variant="subtle"
                color="gray"
                size="lg"
                radius="md"
                aria-label="Configure activity tracking categories"
                disabled={!canEditSettings}
                onClick={() => {
                  setTrackingModalOpen(true);
                }}
              >
                <IconSettings size={20} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </Group>
        }
        retentionAriaLabel="Board activity log retention"
        retentionSelectData={retentionSelectData}
        retentionValue={retentionValue}
        savingRetention={savingRetention || !canEditSettings}
        onRetentionChange={(value) => {
          if (!canEditSettings) return;
          void handleRetentionChange(value);
        }}
        loading={loading}
        totalForDay={activityLogEnabled ? totalForDay : 0}
        activities={activityLogEnabled ? activities : []}
        emptyMessage={emptyMessage}
        renderRow={(row) => <BoardActivityEntryRow row={row} />}
        selectedDayIndex={selectedDayIndex}
        setSelectedDayIndex={setSelectedDayIndex}
        dayPagesTotal={dayPagesTotal}
        canGoNewer={canGoNewer}
        canGoOlder={canGoOlder}
        dayLabel={dayLabel}
      />

      <BoardActivityTrackingModal
        opened={trackingModalOpen}
        onClose={() => {
          setTrackingModalOpen(false);
        }}
        tracking={activityLogTracking}
        canEdit={canEditSettings}
        logEnabled={activityLogEnabled}
        onSave={handleTrackingSave}
      />
    </>
  );
}
