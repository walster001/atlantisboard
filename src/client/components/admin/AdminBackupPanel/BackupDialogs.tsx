import { memo } from 'react';
import { Button, Group, Modal, NativeSelect, Progress, Stack, Text, TextInput } from '@mantine/core';
import { backupPhaseDisplayLabel } from '../../../utils/adminBackupJobPoll.js';
import type { AdminBackupListItem } from '../../../../shared/types/adminBackup.js';
import {
  BACKUP_SCHEDULE_UNIT_OPTIONS,
  clampBackupScheduleAmount,
  isBackupScheduleUnit,
  maxAmountForScheduleUnit,
  parseBackupScheduleAmount,
  type BackupScheduleUnit,
} from '../../../../shared/constants/backupScheduleInterval.js';
import type { RestoreStatus } from './useAdminBackupPanelState.js';

interface BackupDialogsProps {
  readonly createOpen: boolean;
  readonly setCreateOpen: (next: boolean) => void;
  readonly creating: boolean;
  readonly createFilename: string;
  readonly setCreateFilename: (next: string) => void;
  readonly runBackup: () => Promise<void>;
  readonly backupLocationConfigured: boolean;
  readonly defaultLocation: string;
  readonly scheduleOpen: boolean;
  readonly setScheduleOpen: (next: boolean) => void;
  readonly savingSchedule: boolean;
  readonly scheduleFilename: string;
  readonly setScheduleFilename: (next: string) => void;
  readonly editScheduleTarget: AdminBackupListItem | null;
  readonly scheduleAmount: number;
  readonly setScheduleAmount: (next: number | ((current: number) => number)) => void;
  readonly scheduleUnit: BackupScheduleUnit;
  readonly setScheduleUnit: (next: BackupScheduleUnit) => void;
  readonly saveSchedule: () => Promise<void>;
  readonly restoreOpen: boolean;
  readonly setRestoreOpen: (next: boolean) => void;
  readonly restoreTarget: AdminBackupListItem | null;
  readonly setRestoreTarget: (next: AdminBackupListItem | null) => void;
  readonly restoreConfirm: string;
  readonly setRestoreConfirm: (next: string) => void;
  readonly restoring: boolean;
  readonly restoreStatus: RestoreStatus;
  readonly restoreProgress: number;
  readonly restorePhase: string | undefined;
  readonly restoreJobId: string | null;
  readonly restoreFailure: string | null;
  readonly doRestore: () => Promise<void>;
}

export const BackupDialogs = memo(function BackupDialogs({
  createOpen,
  setCreateOpen,
  creating,
  createFilename,
  setCreateFilename,
  runBackup,
  backupLocationConfigured,
  defaultLocation,
  scheduleOpen,
  setScheduleOpen,
  savingSchedule,
  scheduleFilename,
  setScheduleFilename,
  editScheduleTarget,
  scheduleAmount,
  setScheduleAmount,
  scheduleUnit,
  setScheduleUnit,
  saveSchedule,
  restoreOpen,
  setRestoreOpen,
  restoreTarget,
  setRestoreTarget,
  restoreConfirm,
  setRestoreConfirm,
  restoring,
  restoreStatus,
  restoreProgress,
  restorePhase,
  restoreJobId,
  restoreFailure,
  doRestore,
}: BackupDialogsProps) {
  return (
    <>
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
            onChange={(event) => setCreateFilename(event.currentTarget.value)}
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
        title={editScheduleTarget != null ? 'Edit Scheduled Backup' : 'Create Scheduled Backup'}
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
          <TextInput
            label="Filename template"
            value={scheduleFilename}
            onChange={(event) => setScheduleFilename(event.currentTarget.value)}
            placeholder="scheduled-backup.zip"
            disabled={savingSchedule}
            description="Each run appends a timestamp to this name."
          />
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Frequency
            </Text>
            <Group gap="xs" align="center" wrap="nowrap">
              <TextInput
                type="number"
                inputMode="numeric"
                min={1}
                max={maxAmountForScheduleUnit(scheduleUnit)}
                value={String(scheduleAmount)}
                onChange={(event) => {
                  const parsed = parseBackupScheduleAmount(event.currentTarget.value);
                  if (parsed != null) {
                    setScheduleAmount(clampBackupScheduleAmount(parsed, scheduleUnit));
                  }
                }}
                disabled={savingSchedule}
                w={96}
                aria-label="Scheduled backup frequency amount"
              />
              <NativeSelect
                data={BACKUP_SCHEDULE_UNIT_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                value={scheduleUnit}
                onChange={(event) => {
                  const unit = event.currentTarget.value;
                  if (isBackupScheduleUnit(unit)) {
                    setScheduleUnit(unit);
                    setScheduleAmount((current) => clampBackupScheduleAmount(current, unit));
                  }
                }}
                disabled={savingSchedule}
                w={120}
                aria-label="Scheduled backup frequency unit"
              />
            </Group>
            <Text size="xs" c="dimmed">
              Run a full backup automatically on this interval (minimum 1 hour; months use 30-day periods).
            </Text>
          </Stack>
          <Group justify="flex-end">
            <Button variant="default" disabled={savingSchedule} onClick={() => setScheduleOpen(false)}>
              Close
            </Button>
            <Button loading={savingSchedule} onClick={() => void saveSchedule()}>
              {editScheduleTarget != null ? 'Save changes' : 'Create schedule'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={restoreOpen}
        onClose={() => {
          setRestoreOpen(false);
          setRestoreTarget(null);
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
            onChange={(event) => setRestoreConfirm(event.currentTarget.value)}
            disabled={restoring || restoreStatus === 'processing' || restoreStatus === 'completed'}
            autoComplete="off"
          />
          {(restoring ||
            restoreStatus === 'processing' ||
            restoreStatus === 'completed' ||
            restoreStatus === 'failed' ||
            restoreStatus === 'cancelled') && (
            <Stack gap={6}>
              <Text size="sm">{backupPhaseDisplayLabel(restorePhase)}</Text>
              <Progress value={restoreProgress} size="sm" />
              <Text size="xs" c="dimmed">
                Status: {restoreStatus}
                {restoreJobId != null ? ` • Job ${restoreJobId}` : ''}
              </Text>
              {restoreFailure != null && (
                <Text size="xs" c="red">
                  {restoreFailure}
                </Text>
              )}
            </Stack>
          )}
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setRestoreOpen(false);
                setRestoreTarget(null);
              }}
            >
              Close
            </Button>
            <Button
              color="red"
              loading={restoring}
              disabled={
                restoreTarget == null ||
                restoreConfirm !== restoreTarget.folderId ||
                restoreStatus === 'processing' ||
                restoreStatus === 'completed'
              }
              onClick={() => void doRestore()}
            >
              Restore
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
});
