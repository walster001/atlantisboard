import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { isAxiosError } from 'axios';
import { IconDatabase, IconTrash } from '@tabler/icons-react';
import type { AdminBackupListItem } from '../../../shared/types/adminBackup.js';
import { api } from '../../utils/api.js';
import {
  formatBackupBytes,
  pollAdminBackupJobWithNotifications,
} from '../../utils/adminBackupJobPoll.js';
import {
  LONG_TASK_NOTIFICATION_POSITION,
  renderStartupProgressMessage,
  wait,
} from '../../utils/longTaskProgressNotifications.js';

const BACKUP_PROGRESS_NOTIFICATION_ID = 'admin-configuration-backup';

export const AdminBackupPanel = memo(function AdminBackupPanel() {
  const [backups, setBackups] = useState<readonly AdminBackupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [retention, setRetention] = useState(14);
  const [savingRetention, setSavingRetention] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<AdminBackupListItem | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, cfgRes] = await Promise.all([api.listAdminBackups(), api.getAdminConfig()]);
      setBackups(listRes.backups);
      const cfg = cfgRes.config as { backupSettings?: { retentionDays?: number } };
      const d = cfg.backupSettings?.retentionDays;
      if (typeof d === 'number' && Number.isFinite(d)) {
        setRetention(Math.min(3650, Math.max(1, Math.floor(d))));
      }
    } catch (e: unknown) {
      notifications.show({
        title: 'Could not load backups',
        message: e instanceof Error ? e.message : 'Unknown error',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () =>
      backups.map((b) => (
        <Table.Tr key={b.folderId}>
          <Table.Td>
            <Text size="sm" ff="monospace">
              {b.folderId}
            </Text>
          </Table.Td>
          <Table.Td>{new Date(b.lastModified).toLocaleString()}</Table.Td>
          <Table.Td>{formatBackupBytes(b.sizeBytes)}</Table.Td>
          <Table.Td>
            <Group gap="xs" wrap="nowrap">
              <Button
                size="xs"
                variant="light"
                onClick={() => {
                  setRestoreTarget(b);
                  setRestoreConfirm('');
                  setRestoreOpen(true);
                }}
              >
                Restore
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
                        Permanently delete backup <Text span ff="monospace">{b.folderId}</Text> from
                        object storage.
                      </Text>
                    ),
                    labels: { confirm: 'Delete', cancel: 'Cancel' },
                    confirmProps: { color: 'red' },
                    onConfirm: async () => {
                      try {
                        await api.deleteAdminBackup(b.folderId);
                        notifications.show({ title: 'Backup deleted', message: b.folderId });
                        await load();
                      } catch (e: unknown) {
                        notifications.show({
                          title: 'Delete failed',
                          message: e instanceof Error ? e.message : 'Unknown error',
                          color: 'red',
                        });
                      }
                    },
                  });
                }}
              >
                Delete
              </Button>
            </Group>
          </Table.Td>
        </Table.Tr>
      )),
    [backups, load],
  );

  const saveRetention = async (): Promise<void> => {
    setSavingRetention(true);
    try {
      await api.updateAdminConfig({ backupSettings: { retentionDays: retention } });
      notifications.show({ title: 'Retention saved', message: `${retention} days` });
    } catch (e: unknown) {
      notifications.show({
        title: 'Save failed',
        message: e instanceof Error ? e.message : 'Unknown error',
        color: 'red',
      });
    } finally {
      setSavingRetention(false);
    }
  };

  const runBackup = (): void => {
    if (running) {
      return;
    }
    setRunning(true);

    notifications.show({
      id: BACKUP_PROGRESS_NOTIFICATION_ID,
      color: 'blue',
      title: 'Backup starting',
      message: renderStartupProgressMessage('Preparing full backup…', 4),
      loading: true,
      autoClose: false,
      withCloseButton: false,
      position: LONG_TASK_NOTIFICATION_POSITION,
    });

    void (async () => {
      try {
        await wait(0);
        notifications.update({
          id: BACKUP_PROGRESS_NOTIFICATION_ID,
          color: 'blue',
          title: 'Backup starting',
          message: renderStartupProgressMessage('Requesting server-side backup job…', 11),
          loading: true,
          autoClose: false,
          withCloseButton: false,
          position: LONG_TASK_NOTIFICATION_POSITION,
        });

        const { jobId, reusedExisting } = await api.startAdminBackup();

        notifications.update({
          id: BACKUP_PROGRESS_NOTIFICATION_ID,
          color: 'blue',
          title: reusedExisting ? 'Backup already running' : 'Backup started',
          message: renderStartupProgressMessage(
            reusedExisting
              ? 'A backup job is already in progress. Showing its status…'
              : 'Backup job created on the server. Polling progress…',
            20,
          ),
          loading: true,
          autoClose: false,
          withCloseButton: false,
          position: LONG_TASK_NOTIFICATION_POSITION,
        });

        await pollAdminBackupJobWithNotifications(jobId, BACKUP_PROGRESS_NOTIFICATION_ID, load);
      } catch (err: unknown) {
        let message = 'Backup failed to start.';
        if (isAxiosError(err)) {
          const data = err.response?.data as { error?: { message?: string } } | undefined;
          message = data?.error?.message ?? err.message;
        } else if (err instanceof Error) {
          message = err.message;
        }
        notifications.update({
          id: BACKUP_PROGRESS_NOTIFICATION_ID,
          color: 'red',
          title: 'Backup start failed',
          message,
          loading: false,
          autoClose: false,
          withCloseButton: true,
          position: LONG_TASK_NOTIFICATION_POSITION,
        });
      } finally {
        setRunning(false);
      }
    })();
  };

  const doRestore = async (): Promise<void> => {
    if (restoreTarget == null) return;
    if (restoreConfirm !== restoreTarget.folderId) return;
    setRestoring(true);
    try {
      const r = await api.restoreAdminBackup(restoreTarget.folderId, restoreConfirm);
      notifications.show({ title: 'Restore complete', message: r.message });
      setRestoreOpen(false);
      setRestoreTarget(null);
    } catch (e: unknown) {
      notifications.show({
        title: 'Restore failed',
        message: e instanceof Error ? e.message : 'Unknown error',
        color: 'red',
      });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Stack gap="md">
      <Title order={3}>Backup</Title>
      <Text size="sm" c="dimmed">
        Full snapshots include MongoDB collections and MinIO object data (excluding the backups
        bucket). Backups are stored under a timestamped folder in the <Text span ff="monospace">backups</Text>{' '}
        bucket. The server runs the backup job; this UI only starts the job and shows progress from
        the server. Restoring replaces database documents and object files — use only on a trusted archive.
      </Text>

      <Group align="flex-end" wrap="wrap">
        <NumberInput
          label="Retention (days)"
          description="Older backups are removed after each successful run."
          min={1}
          max={3650}
          value={retention}
          onChange={(v) => {
            if (typeof v === 'number' && Number.isFinite(v)) {
              setRetention(v);
            }
          }}
          allowDecimal={false}
          w={200}
        />
        <Button loading={savingRetention} variant="default" onClick={() => void saveRetention()}>
          Save retention
        </Button>
        <Button
          leftSection={<IconDatabase size={18} />}
          loading={running}
          onClick={runBackup}
        >
          Create backup now
        </Button>
      </Group>

      {loading ? (
        <Group>
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Loading backups…
          </Text>
        </Group>
      ) : (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Folder</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Size</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
      )}

      <Modal
        opened={restoreOpen}
        onClose={() => {
          if (!restoring) {
            setRestoreOpen(false);
            setRestoreTarget(null);
          }
        }}
        title="Restore backup"
      >
        <Stack gap="sm">
          <Text size="sm">
            Type the folder id exactly to confirm destructive restore from{' '}
            <Text span ff="monospace">
              {restoreTarget?.folderId ?? ''}
            </Text>
            .
          </Text>
          <TextInput
            label="Confirm folder id"
            value={restoreConfirm}
            onChange={(e) => setRestoreConfirm(e.currentTarget.value)}
            disabled={restoring}
            autoComplete="off"
          />
          <Group justify="flex-end">
            <Button variant="default" disabled={restoring} onClick={() => setRestoreOpen(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={restoring}
              disabled={restoreTarget == null || restoreConfirm !== restoreTarget.folderId}
              onClick={() => void doRestore()}
            >
              Restore
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
});
