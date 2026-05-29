import type { ReactElement } from 'react';
import { Progress, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { LONG_TASK_NOTIFICATION_POSITION } from './longTaskProgressNotifications.js';

const ATTACHMENT_UPLOAD_NOTIFICATION_ID = 'card-attachment-upload';

function renderUploadProgressMessage(label: string, percent: number): ReactElement {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));
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

export function beginAttachmentUploadNotification(label: string): void {
  notifications.show({
    id: ATTACHMENT_UPLOAD_NOTIFICATION_ID,
    color: 'blue',
    title: 'Uploading attachment',
    message: renderUploadProgressMessage(label, 0),
    loading: true,
    autoClose: false,
    withCloseButton: false,
    position: LONG_TASK_NOTIFICATION_POSITION,
  });
}

export function updateAttachmentUploadNotification(label: string, percent: number): void {
  notifications.update({
    id: ATTACHMENT_UPLOAD_NOTIFICATION_ID,
    color: 'blue',
    title: 'Uploading attachment',
    message: renderUploadProgressMessage(label, percent),
    loading: percent < 100,
    autoClose: false,
    withCloseButton: false,
    position: LONG_TASK_NOTIFICATION_POSITION,
  });
}

export function completeAttachmentUploadNotification(fileName: string): void {
  notifications.update({
    id: ATTACHMENT_UPLOAD_NOTIFICATION_ID,
    color: 'green',
    title: 'Upload complete',
    message: fileName,
    loading: false,
    autoClose: 1000,
    withCloseButton: true,
    position: LONG_TASK_NOTIFICATION_POSITION,
  });
}

export function failAttachmentUploadNotification(message: string): void {
  notifications.update({
    id: ATTACHMENT_UPLOAD_NOTIFICATION_ID,
    color: 'red',
    title: 'Upload failed',
    message,
    loading: false,
    autoClose: false,
    withCloseButton: true,
    position: LONG_TASK_NOTIFICATION_POSITION,
  });
}
