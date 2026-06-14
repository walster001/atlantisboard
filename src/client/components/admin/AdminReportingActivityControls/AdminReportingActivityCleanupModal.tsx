import { Button, Group, Modal, NumberInput, Stack, Text } from '@mantine/core';
import { memo, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { clampManualActivityCleanupDays } from '../../../../shared/adminReportingActivityRetention.js';
import { api } from '../../../utils/api.js';
import { readApiErrorMessage } from '../AdminBackupPanel/helpers.js';

export type AdminReportingActivityCleanupKind = 'member' | 'board';

interface AdminReportingActivityCleanupModalProps {
  readonly kind: AdminReportingActivityCleanupKind;
  readonly opened: boolean;
  readonly onClose: () => void;
}

export const AdminReportingActivityCleanupModal = memo(function AdminReportingActivityCleanupModal({
  kind,
  opened,
  onClose,
}: AdminReportingActivityCleanupModalProps) {
  const [olderThanDays, setOlderThanDays] = useState<number | string>(30);
  const [running, setRunning] = useState(false);

  const activityLabel = kind === 'member' ? 'member audit' : 'board content activity';

  const handleCleanup = async (): Promise<void> => {
    const parsed =
      typeof olderThanDays === 'number'
        ? olderThanDays
        : Number.parseInt(String(olderThanDays), 10);
    const days = clampManualActivityCleanupDays(parsed);
    setRunning(true);
    try {
      const result =
        kind === 'member'
          ? await api.cleanupAdminReportingMemberActivity(days)
          : await api.cleanupAdminReportingBoardActivity(days);
      notifications.show({
        title: 'Cleanup complete',
        message: `Removed ${result.deletedCount} ${activityLabel} record${result.deletedCount === 1 ? '' : 's'} older than ${result.olderThanDays} days.`,
        color: 'green',
      });
      onClose();
    } catch (error: unknown) {
      notifications.show({
        title: 'Cleanup failed',
        message: readApiErrorMessage(error, 'Could not delete old records'),
        color: 'red',
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Cleanup old records"
      centered
    >
      <Stack gap="md">
        <Text size="sm">
          Permanently delete {activityLabel} records across all boards that are older than the
          specified number of days. This cannot be undone.
        </Text>
        <NumberInput
          label="Delete records older than (days)"
          min={1}
          max={3650}
          value={olderThanDays}
          onChange={setOlderThanDays}
          disabled={running}
        />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button color="red" loading={running} onClick={() => void handleCleanup()}>
            Delete old records
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
});
