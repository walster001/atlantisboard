import { Alert, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconHistory } from '@tabler/icons-react';
import type { BoardSettingsLivePatch } from '../../store/database.js';
import { BoardDayLogPanel } from '../board-logs/BoardDayLogPanel.js';
import { useMemberAuditLog } from '../../hooks/activities/useMemberAuditLog.js';
import { MemberAuditEntryRow } from './memberAuditLogParts.js';

interface MemberAuditLogProps {
  boardId: string;
  onSettingsLivePatch?: (patch: BoardSettingsLivePatch) => void;
  mobileLayout?: boolean;
}

export function MemberAuditLog({ boardId, onSettingsLivePatch, mobileLayout = false }: MemberAuditLogProps) {
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
  } = useMemberAuditLog(boardId, onSettingsLivePatch);

  if (forbidden) {
    return (
      <Alert color="yellow" title="No access">
        Only board admins and managers can view the member activity log.
      </Alert>
    );
  }

  return (
    <BoardDayLogPanel
      mobileLayout={mobileLayout}
      header={
        <Group gap="sm" align="flex-start" wrap="nowrap">
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
      }
      retentionAriaLabel="Member activity log retention"
      retentionSelectData={retentionSelectData}
      retentionValue={retentionValue}
      savingRetention={savingRetention}
      onRetentionChange={handleRetentionChange}
      loading={loading}
      totalForDay={totalForDay}
      activities={activities}
      emptyMessage={`No member activity on ${dayLabel}.`}
      renderRow={(row) => (
        <MemberAuditEntryRow row={row} resolveRoleLabel={resolveRoleLabel} />
      )}
      selectedDayIndex={selectedDayIndex}
      setSelectedDayIndex={setSelectedDayIndex}
      dayPagesTotal={dayPagesTotal}
      canGoNewer={canGoNewer}
      canGoOlder={canGoOlder}
      dayLabel={dayLabel}
    />
  );
}
