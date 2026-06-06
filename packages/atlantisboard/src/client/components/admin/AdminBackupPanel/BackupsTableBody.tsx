import { memo } from 'react';
import { Badge, Button, Group, Progress, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { IconTrash } from '@tabler/icons-react';
import type { AdminBackupListItem } from '../../../../shared/types/adminBackup.js';
import { api } from '../../../utils/api.js';
import { formatBackupBytes } from '../../../utils/adminBackupJobPoll.js';

interface BackupsTableBodyProps {
  readonly backups: readonly AdminBackupListItem[];
  readonly refreshBackupList: () => Promise<void>;
  readonly onOpenRestoreModal: (target: AdminBackupListItem) => void;
  /** Admin configuration on narrow viewports: omit created/size cells. */
  readonly hideMetaColumns?: boolean;
}

export const BackupsTableBody = memo(function BackupsTableBody({
  backups,
  refreshBackupList,
  onOpenRestoreModal,
  hideMetaColumns = false,
}: BackupsTableBodyProps) {
  return (
    <>
      {backups.map((backup) => (
        <Table.Tr key={backup.folderId}>
          <Table.Td>
            <Text size="sm" ff="monospace">
              {backup.folderId}
            </Text>
          </Table.Td>
          {!hideMetaColumns ? (
            <>
              <Table.Td>{new Date(backup.lastModified).toLocaleString()}</Table.Td>
              <Table.Td>{formatBackupBytes(backup.sizeBytes)}</Table.Td>
            </>
          ) : null}
          <Table.Td>
            {backup.status === 'processing' || backup.status === 'pending' ? (
              <Stack gap={6}>
                <Group gap="xs">
                  <Badge color="blue" variant="light">
                    In progress
                  </Badge>
                  <Text size="xs" c="dimmed">
                    {Math.max(0, Math.min(100, Math.floor(backup.progress ?? 0)))}%
                  </Text>
                </Group>
                <Progress value={Math.max(0, Math.min(100, backup.progress ?? 0))} size="sm" />
                <Group justify="flex-start">
                  <Button
                    size="xs"
                    color="red"
                    variant="light"
                    onClick={async () => {
                      if (!backup.jobId) return;
                      try {
                        await api.cancelAdminBackupJob(backup.jobId);
                        notifications.show({ title: 'Cancel requested', message: backup.folderId });
                        await refreshBackupList();
                      } catch (error: unknown) {
                        notifications.show({
                          title: 'Cancel failed',
                          message: error instanceof Error ? error.message : 'Unknown error',
                          color: 'red',
                        });
                      }
                    }}
                  >
                    Cancel
                  </Button>
                </Group>
              </Stack>
            ) : backup.status === 'completed' || backup.status == null ? (
              <Group gap="xs" wrap="nowrap">
                <Button size="xs" variant="light" onClick={() => onOpenRestoreModal(backup)}>
                  {hideMetaColumns ? 'Restore' : 'Restore backup'}
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={() => {
                    modals.openConfirmModal({
                      title: 'Delete backup?',
                      children: (
                        <Text size="sm">
                          Permanently delete backup <Text span ff="monospace">{backup.folderId}</Text> from
                          local storage.
                        </Text>
                      ),
                      labels: { confirm: 'Delete', cancel: 'Cancel' },
                      confirmProps: { color: 'red' },
                      onConfirm: async () => {
                        try {
                          await api.deleteAdminBackup(backup.folderId);
                          notifications.show({ title: 'Backup deleted', message: backup.folderId });
                          await refreshBackupList();
                        } catch (error: unknown) {
                          notifications.show({
                            title: 'Delete failed',
                            message: error instanceof Error ? error.message : 'Unknown error',
                            color: 'red',
                          });
                        }
                      },
                    });
                  }}
                >
                  {hideMetaColumns ? 'Delete' : 'Delete backup'}
                </Button>
              </Group>
            ) : (
              <Badge color={backup.status === 'failed' ? 'red' : 'gray'} variant="light">
                {backup.status === 'failed' ? 'Failed' : 'Cancelled'}
              </Badge>
            )}
          </Table.Td>
        </Table.Tr>
      ))}
    </>
  );
});
