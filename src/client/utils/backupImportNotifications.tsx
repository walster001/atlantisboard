import type { ReactElement } from 'react';
import { Progress, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { LONG_TASK_NOTIFICATION_POSITION } from './longTaskProgressNotifications.js';

const BACKUP_IMPORT_NOTIFICATION_ID = 'admin-backup-import';

function renderUploadProgressMessage(label: string, percent: number): ReactElement {
  const clamped = Math.min(99, Math.max(0, Math.round(percent)));
  return (
    <Stack gap={6}>
      <Text size="sm">{label}</Text>
      <Progress value={clamped} radius="md" size="sm" />
      <Text size="xs" c="dimmed">
        {clamped}%
      </Text>
    </Stack>
  );
}

function renderMalwareScanMessage(label: string): ReactElement {
  return (
    <Stack gap={6}>
      <Text size="sm">{label}</Text>
      <Text size="sm">Scanning for Malware</Text>
      <Progress value={100} radius="md" size="sm" animated />
    </Stack>
  );
}

export function beginBackupImportNotification(label: string): void {
  notifications.show({
    id: BACKUP_IMPORT_NOTIFICATION_ID,
    color: 'blue',
    title: 'Importing backup',
    message: renderUploadProgressMessage(label, 0),
    loading: true,
    autoClose: false,
    withCloseButton: false,
    position: LONG_TASK_NOTIFICATION_POSITION,
  });
}

export function updateBackupImportNotification(label: string, percent: number): void {
  if (percent >= 100) {
    notifications.update({
      id: BACKUP_IMPORT_NOTIFICATION_ID,
      color: 'blue',
      title: 'Scanning for Malware',
      message: renderMalwareScanMessage(label),
      loading: true,
      autoClose: false,
      withCloseButton: false,
      position: LONG_TASK_NOTIFICATION_POSITION,
    });
    return;
  }

  notifications.update({
    id: BACKUP_IMPORT_NOTIFICATION_ID,
    color: 'blue',
    title: 'Importing backup',
    message: renderUploadProgressMessage(label, percent),
    loading: true,
    autoClose: false,
    withCloseButton: false,
    position: LONG_TASK_NOTIFICATION_POSITION,
  });
}

export function completeBackupImportNotification(fileName: string): void {
  notifications.update({
    id: BACKUP_IMPORT_NOTIFICATION_ID,
    color: 'green',
    title: 'Backup imported',
    message: fileName,
    loading: false,
    autoClose: 3000,
    withCloseButton: true,
    position: LONG_TASK_NOTIFICATION_POSITION,
  });
}

export function failBackupImportNotification(message: string): void {
  notifications.update({
    id: BACKUP_IMPORT_NOTIFICATION_ID,
    color: 'red',
    title: 'Import failed',
    message,
    loading: false,
    autoClose: false,
    withCloseButton: true,
    position: LONG_TASK_NOTIFICATION_POSITION,
  });
}
