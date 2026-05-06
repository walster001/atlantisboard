import { memo } from 'react';
import { Badge, Button, Group, Loader, NumberInput, Progress, Stack, Table, Text, Title } from '@mantine/core';
import { IconDatabase } from '@tabler/icons-react';
import { backupPhaseDisplayLabel } from '../../utils/adminBackupJobPoll.js';
import { BackupsTableBody } from './AdminBackupPanel/BackupsTableBody.js';
import { BackupDialogs } from './AdminBackupPanel/BackupDialogs.js';
import { useAdminBackupPanelState } from './AdminBackupPanel/useAdminBackupPanelState.js';

export const AdminBackupPanel = memo(function AdminBackupPanel() {
  const {
    backups,
    loading,
    running,
    retention,
    setRetention,
    savingRetention,
    defaultLocation,
    backupLocationConfigured,
    scheduleDays,
    setScheduleDays,
    scheduleEnabled,
    createOpen,
    setCreateOpen,
    createFilename,
    setCreateFilename,
    creating,
    scheduleOpen,
    setScheduleOpen,
    savingSchedule,
    restoreOpen,
    setRestoreOpen,
    restoreTarget,
    setRestoreTarget,
    restoreConfirm,
    setRestoreConfirm,
    restoring,
    restoreJobId,
    restoreProgress,
    restorePhase,
    restoreFailure,
    restoreStatus,
    refreshBackupList,
    saveRetention,
    runBackup,
    saveSchedule,
    doRestore,
  } = useAdminBackupPanelState();

  return (
    <Stack gap="md">
      <Title order={3}>Backup</Title>
      <Text size="sm" c="dimmed">
        Full snapshots include MongoDB data (Boards,Cards,Users,Settings,Workspaces) as well as MinIO data (Card Attachments, Inline Button Icons, Filestores). Backups
        are written under the configured backup path.
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
          <Table.Tbody>
            <BackupsTableBody
              backups={backups}
              refreshBackupList={refreshBackupList}
              onOpenRestoreModal={(target) => {
                setRestoreTarget(target);
                setRestoreConfirm('');
                setRestoreOpen(true);
              }}
            />
          </Table.Tbody>
        </Table>
      )}
      <BackupDialogs
        createOpen={createOpen}
        setCreateOpen={setCreateOpen}
        creating={creating}
        createFilename={createFilename}
        setCreateFilename={setCreateFilename}
        runBackup={runBackup}
        backupLocationConfigured={backupLocationConfigured}
        defaultLocation={defaultLocation}
        scheduleOpen={scheduleOpen}
        setScheduleOpen={setScheduleOpen}
        savingSchedule={savingSchedule}
        scheduleDays={scheduleDays}
        setScheduleDays={setScheduleDays}
        saveSchedule={saveSchedule}
        restoreOpen={restoreOpen}
        setRestoreOpen={setRestoreOpen}
        restoreTarget={restoreTarget}
        setRestoreTarget={setRestoreTarget}
        restoreConfirm={restoreConfirm}
        setRestoreConfirm={setRestoreConfirm}
        restoring={restoring}
        restoreStatus={restoreStatus}
        restoreProgress={restoreProgress}
        restorePhase={restorePhase}
        restoreJobId={restoreJobId}
        restoreFailure={restoreFailure}
        doRestore={doRestore}
      />

      <Text size="xs" c="dimmed">
        Backup path (BACKUP_LOCATION): <Text span ff="monospace">{defaultLocation || 'Not set'}</Text> | Scheduled:{' '}
        {scheduleEnabled ? `Every ${scheduleDays} day(s)` : 'Disabled'}
      </Text>

      {(restoreStatus === 'pending' || restoreStatus === 'processing') && (
        <Stack gap={6}>
          <Group gap="xs">
            <Badge color="orange" variant="light">
              Restore in progress
            </Badge>
            <Text size="xs" c="dimmed">
              {backupPhaseDisplayLabel(restorePhase)}
            </Text>
          </Group>
          <Progress value={restoreProgress} size="sm" />
          <Text size="xs" c="dimmed">
            {restoreJobId != null ? `Job ${restoreJobId}` : 'Restore job running on server'}
          </Text>
        </Stack>
      )}

    </Stack>
  );
});
