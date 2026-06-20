import { memo } from 'react';
import { Badge, Button, FileButton, Group, Loader, NativeSelect, Progress, Stack, Table, Text, Title } from '@mantine/core';
import { IconDatabase, IconUpload } from '@tabler/icons-react';
import { BACKUP_RETENTION_OPTIONS, parseBackupRetentionSelectValue } from '../../../shared/constants/backupRetention.js';
import { buildDefaultBackupFilename } from '../../../shared/utils/backupFolderNaming.js';
import { backupPhaseDisplayLabel } from '../../utils/adminBackupJobPoll.js';
import { BackupsTableBody } from './AdminBackupPanel/BackupsTableBody.js';
import { BackupDialogs } from './AdminBackupPanel/BackupDialogs.js';
import { BackupLocationSection } from './AdminBackupPanel/BackupLocationSection.js';
import { useAdminBackupPanelState } from './AdminBackupPanel/useAdminBackupPanelState.js';
import { useResponsiveTier } from '../../hooks/useResponsiveTier.js';

export const AdminBackupPanel = memo(function AdminBackupPanel() {
  const responsiveTier = useResponsiveTier();
  const hideBackupMetaColumns = responsiveTier === 'mobile';
  const {
    backups,
    loading,
    running,
    retention,
    setRetention,
    savingRetention,
    defaultLocation,
    backupLocationConfigured,
    dockerFullstack,
    suggestedBackupPath,
    scheduleAmount,
    setScheduleAmount,
    scheduleUnit,
    setScheduleUnit,
    createOpen,
    setCreateOpen,
    createFilename,
    setCreateFilename,
    creating,
    scheduleOpen,
    setScheduleOpen,
    savingSchedule,
    scheduleFilename,
    setScheduleFilename,
    editScheduleTarget,
    openCreateScheduleModal,
    openEditScheduleModal,
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
    locationInput,
    setLocationInput,
    locationCheck,
    checkingLocation,
    savingLocation,
    checkBackupLocation,
    saveBackupLocation,
    downloadBackup,
    downloadingBackupId,
    importingBackup,
    importBackup,
  } = useAdminBackupPanelState();

  return (
    <Stack gap="md">
      <Title order={3}>Backup</Title>
      <Text size="sm" c="dimmed">
        Full snapshots include MongoDB data (Boards,Cards,Users,Settings,Workspaces) as well as MinIO data (Card Attachments, Inline Button Icons, Filestores). Backups
        are written under the configured backup path.
      </Text>

      <BackupLocationSection
        locationInput={locationInput}
        setLocationInput={setLocationInput}
        defaultLocation={defaultLocation}
        backupLocationConfigured={backupLocationConfigured}
        dockerFullstack={dockerFullstack}
        suggestedPath={suggestedBackupPath}
        locationCheck={locationCheck}
        checkingLocation={checkingLocation}
        savingLocation={savingLocation}
        onCheckLocation={checkBackupLocation}
        onSaveLocation={saveBackupLocation}
      />

      <Group align="flex-end" wrap="wrap">
        <NativeSelect
          label="Retention"
          description="Older backups are removed after each successful run."
          data={BACKUP_RETENTION_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          value={String(retention)}
          onChange={(event) => {
            const parsed = parseBackupRetentionSelectValue(event.currentTarget.value);
            if (parsed != null) {
              setRetention(parsed);
            }
          }}
          w={220}
        />
        <Button loading={savingRetention} variant="default" onClick={() => void saveRetention()}>
          Save retention
        </Button>
        <Button
          leftSection={<IconDatabase size={18} />}
          loading={running}
          onClick={() => {
            setCreateFilename(buildDefaultBackupFilename());
            setCreateOpen(true);
          }}
        >
          Create Backup
        </Button>
        <Button variant="default" onClick={openCreateScheduleModal}>
          Create Scheduled Backup
        </Button>
        <FileButton
          accept="application/zip,.zip,application/x-zip-compressed"
          onChange={(file) => void importBackup(file)}
        >
          {(props) => (
            <Button
              {...props}
              variant="default"
              leftSection={<IconUpload size={18} />}
              loading={importingBackup}
            >
              Import Backup
            </Button>
          )}
        </FileButton>
      </Group>

      {loading ? (
        <Group>
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Loading backups…
          </Text>
        </Group>
      ) : (
        <Table striped highlightOnHover withTableBorder layout="fixed">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{hideBackupMetaColumns ? 'Filename' : 'Folder'}</Table.Th>
              {!hideBackupMetaColumns ? (
                <>
                  <Table.Th>Created</Table.Th>
                  <Table.Th>Size</Table.Th>
                </>
              ) : null}
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <BackupsTableBody
              backups={backups}
              refreshBackupList={refreshBackupList}
              hideMetaColumns={hideBackupMetaColumns}
              downloadingBackupId={downloadingBackupId}
              onDownloadBackup={(folderId) => void downloadBackup(folderId)}
              onOpenRestoreModal={(target) => {
                setRestoreTarget(target);
                setRestoreConfirm('');
                setRestoreOpen(true);
              }}
              onEditSchedule={openEditScheduleModal}
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
        scheduleFilename={scheduleFilename}
        setScheduleFilename={setScheduleFilename}
        editScheduleTarget={editScheduleTarget}
        scheduleAmount={scheduleAmount}
        setScheduleAmount={setScheduleAmount}
        scheduleUnit={scheduleUnit}
        setScheduleUnit={setScheduleUnit}
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
