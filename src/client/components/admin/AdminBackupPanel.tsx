import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Progress,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { IconDatabase, IconTrash } from '@tabler/icons-react';
import type { AdminBackupListItem } from '../../../shared/types/adminBackup.js';
import { BACKUP_LOCATION_SETUP_GUIDANCE } from '../../../shared/constants/backupLocationEnv.js';
import { api } from '../../utils/api.js';
import { formatBackupBytes } from '../../utils/adminBackupJobPoll.js';

function readApiErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: unknown } }).response?.data;
    if (data && typeof data === 'object' && 'error' in data) {
      const msg = (data as { error?: { message?: string } }).error?.message;
      if (typeof msg === 'string' && msg.trim() !== '') {
        return msg;
      }
    }
  }
  return err instanceof Error ? err.message : fallback;
}

export const AdminBackupPanel = memo(function AdminBackupPanel() {
  const [backups, setBackups] = useState<readonly AdminBackupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [retention, setRetention] = useState(14);
  const [savingRetention, setSavingRetention] = useState(false);
  const [defaultLocation, setDefaultLocation] = useState('');
  const [backupLocationConfigured, setBackupLocationConfigured] = useState(false);
  const [scheduleDays, setScheduleDays] = useState(14);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createFilename, setCreateFilename] = useState(`backup-${new Date().toISOString().slice(0, 10)}.zip`);
  const [creating, setCreating] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<AdminBackupListItem | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [restoring, setRestoring] = useState(false);

  /** Refreshes only the backup table (no full-tab loading state). Used for polling and after mutations. */
  const refreshBackupList = useCallback(async (): Promise<void> => {
    try {
      const listRes = await api.listAdminBackups();
      setBackups(listRes.backups);
    } catch (e: unknown) {
      notifications.show({
        title: 'Could not refresh backups',
        message: e instanceof Error ? e.message : 'Unknown error',
        color: 'red',
      });
    }
  }, []);

  /** Initial load: table + admin config for retention and schedule defaults. */
  const loadFull = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [listRes, cfgRes] = await Promise.all([api.listAdminBackups(), api.getAdminConfig()]);
      setBackups(listRes.backups);
      const cfg = cfgRes.config as {
        backupSettings?: {
          retentionDays?: number;
          scheduleFrequencyDays?: number;
          scheduleEnabled?: boolean;
          environmentBackupLocation?: string | null;
          environmentBackupLocationConfigured?: boolean;
        };
      };
      const d = cfg.backupSettings?.retentionDays;
      if (typeof d === 'number' && Number.isFinite(d)) {
        setRetention(Math.min(3650, Math.max(1, Math.floor(d))));
      }
      setBackupLocationConfigured(cfg.backupSettings?.environmentBackupLocationConfigured === true);
      if (typeof cfg.backupSettings?.environmentBackupLocation === 'string') {
        setDefaultLocation(cfg.backupSettings.environmentBackupLocation);
      } else {
        setDefaultLocation('');
      }
      if (typeof cfg.backupSettings?.scheduleFrequencyDays === 'number') {
        setScheduleDays(Math.min(3650, Math.max(1, Math.floor(cfg.backupSettings.scheduleFrequencyDays))));
      }
      if (cfg.backupSettings?.scheduleEnabled === true) {
        setScheduleEnabled(true);
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
    void loadFull();
  }, [loadFull]);

  const hasRunningJobs = useMemo(
    () => backups.some((b) => b.status === 'processing' || b.status === 'pending'),
    [backups],
  );

  useEffect(() => {
    if (!hasRunningJobs) {
      return;
    }
    const id = window.setInterval(() => {
      void refreshBackupList();
    }, 2000);
    return () => {
      window.clearInterval(id);
    };
  }, [hasRunningJobs, refreshBackupList]);

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
            {b.status === 'processing' || b.status === 'pending' ? (
              <Stack gap={6}>
                <Group gap="xs">
                  <Badge color="blue" variant="light">
                    In progress
                  </Badge>
                  <Text size="xs" c="dimmed">
                    {Math.max(0, Math.min(100, Math.floor(b.progress ?? 0)))}%
                  </Text>
                </Group>
                <Progress value={Math.max(0, Math.min(100, b.progress ?? 0))} size="sm" />
                <Group justify="flex-start">
                  <Button
                    size="xs"
                    color="red"
                    variant="light"
                    onClick={async () => {
                      if (!b.jobId) return;
                      try {
                        await api.cancelAdminBackupJob(b.jobId);
                        notifications.show({ title: 'Cancel requested', message: b.folderId });
                        await refreshBackupList();
                      } catch (e: unknown) {
                        notifications.show({
                          title: 'Cancel failed',
                          message: e instanceof Error ? e.message : 'Unknown error',
                          color: 'red',
                        });
                      }
                    }}
                  >
                    Cancel
                  </Button>
                </Group>
              </Stack>
            ) : b.status === 'completed' || b.status == null ? (
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
                  Restore backup
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
                          Permanently delete backup <Text span ff="monospace">{b.folderId}</Text> from local
                          storage.
                        </Text>
                      ),
                      labels: { confirm: 'Delete', cancel: 'Cancel' },
                      confirmProps: { color: 'red' },
                      onConfirm: async () => {
                        try {
                          await api.deleteAdminBackup(b.folderId);
                          notifications.show({ title: 'Backup deleted', message: b.folderId });
                          await refreshBackupList();
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
                  Delete backup
                </Button>
              </Group>
            ) : (
              <Badge color={b.status === 'failed' ? 'red' : 'gray'} variant="light">
                {b.status === 'failed' ? 'Failed' : 'Cancelled'}
              </Badge>
            )}
          </Table.Td>
        </Table.Tr>
      )),
    [backups, refreshBackupList],
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

  const runBackup = async (): Promise<void> => {
    if (running || creating) {
      return;
    }
    const filename = createFilename.trim();
    if (filename === '') {
      notifications.show({ title: 'Missing filename', message: 'Enter a backup file name.', color: 'red' });
      return;
    }
    if (!backupLocationConfigured) {
      notifications.show({
        title: 'Backup location not configured',
        message: BACKUP_LOCATION_SETUP_GUIDANCE,
        color: 'red',
      });
      return;
    }
    setCreating(true);
    setRunning(true);
    try {
      await api.startAdminBackup({ filename });
      notifications.show({
        title: 'Backup started',
        message: 'Server backup job is running. Progress is shown in the table.',
      });
      setCreateOpen(false);
      await refreshBackupList();
    } catch (err: unknown) {
      notifications.show({
        title: 'Backup start failed',
        message: readApiErrorMessage(err, 'Backup failed to start.'),
        color: 'red',
      });
    } finally {
      setCreating(false);
      setRunning(false);
    }
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
        Full snapshots include MongoDB data (BSON dumps per collection, cursor-based export) and MinIO
        buckets (via <Text span ff="monospace">mc mirror</Text> when configured on the server). Backups
        are written under the configured backup path. The worker continues if this page is refreshed; the
        table polls job progress without reloading the whole tab.
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
          onClick={() => setCreateOpen(true)}
        >
          Create Backup
        </Button>
        <Button variant="default" onClick={() => setScheduleOpen(true)}>
          Create Scheduled Backup
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
        opened={createOpen}
        onClose={() => {
          if (!creating) setCreateOpen(false);
        }}
        title="Create Backup"
        centered
        size="sm"
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Archive path uses the server backup location
            {backupLocationConfigured ? (
              <>
                : <Text span ff="monospace">{defaultLocation}</Text>
              </>
            ) : (
              <> (not set — configure BACKUP_LOCATION on the server; see .env.example).</>
            )}
          </Text>
          <TextInput
            label="Filename"
            value={createFilename}
            onChange={(e) => setCreateFilename(e.currentTarget.value)}
            placeholder="my-backup.zip"
            disabled={creating}
          />
          <Group justify="flex-end">
            <Button variant="default" disabled={creating} onClick={() => setCreateOpen(false)}>
              Close
            </Button>
            <Button loading={creating} onClick={() => void runBackup()}>
              Create Backup
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={scheduleOpen}
        onClose={() => {
          if (!savingSchedule) setScheduleOpen(false);
        }}
        title="Create Scheduled Backup"
        centered
        size="sm"
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Scheduled archives use the same server backup location as manual backups
            {backupLocationConfigured ? (
              <>
                : <Text span ff="monospace">{defaultLocation}</Text>
              </>
            ) : (
              <> (set BACKUP_LOCATION on the server; see .env.example).</>
            )}
          </Text>
          <NumberInput
            label="Frequency (days)"
            value={scheduleDays}
            onChange={(v) => {
              if (typeof v === 'number' && Number.isFinite(v)) {
                setScheduleDays(Math.min(3650, Math.max(1, Math.floor(v))));
              }
            }}
            min={1}
            max={3650}
            allowDecimal={false}
            disabled={savingSchedule}
          />
          <Group justify="flex-end">
            <Button variant="default" disabled={savingSchedule} onClick={() => setScheduleOpen(false)}>
              Close
            </Button>
            <Button
              loading={savingSchedule}
              onClick={async () => {
                if (!backupLocationConfigured) {
                  notifications.show({
                    title: 'Backup location not configured',
                    message: BACKUP_LOCATION_SETUP_GUIDANCE,
                    color: 'red',
                  });
                  return;
                }
                setSavingSchedule(true);
                try {
                  await api.updateAdminConfig({
                    backupSettings: {
                      retentionDays: retention,
                      scheduleEnabled: true,
                      scheduleFrequencyDays: scheduleDays,
                    },
                  });
                  setScheduleEnabled(true);
                  notifications.show({ title: 'Scheduled backup enabled', message: `Every ${scheduleDays} day(s)` });
                  setScheduleOpen(false);
                  await refreshBackupList();
                } catch (e: unknown) {
                  notifications.show({
                    title: 'Save failed',
                    message: readApiErrorMessage(e, 'Unknown error'),
                    color: 'red',
                  });
                } finally {
                  setSavingSchedule(false);
                }
              }}
            >
              Save schedule
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Text size="xs" c="dimmed">
        Backup path (BACKUP_LOCATION): <Text span ff="monospace">{defaultLocation || 'Not set'}</Text> | Scheduled:{' '}
        {scheduleEnabled ? `Every ${scheduleDays} day(s)` : 'Disabled'}
      </Text>

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
