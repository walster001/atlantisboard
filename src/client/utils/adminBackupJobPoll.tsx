import type { ReactElement } from 'react';
import { Progress, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api } from './api.js';
import { LONG_TASK_NOTIFICATION_POSITION, wait } from './longTaskProgressNotifications.js';

export function formatBackupBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export interface BackupJobClientView {
  status: string;
  progress: number;
  totalItems: number;
  processedItems: number;
  currentPhase?: string;
  failureMessage?: string;
  result?: {
    folderId: string;
    filePath: string;
    sizeBytes: number;
    prunedCount: number;
  };
}

export function parseBackupJob(job: unknown): BackupJobClientView | null {
  if (job == null || typeof job !== 'object') {
    return null;
  }
  const j = job as Record<string, unknown>;
  const status = j.status;
  if (typeof status !== 'string') {
    return null;
  }
  const progress = typeof j.progress === 'number' ? j.progress : 0;
  const totalItems = typeof j.totalItems === 'number' ? j.totalItems : 5;
  const processedItems = typeof j.processedItems === 'number' ? j.processedItems : 0;
  const currentPhase = typeof j.currentPhase === 'string' ? j.currentPhase : undefined;
  const failureMessage = typeof j.failureMessage === 'string' ? j.failureMessage : undefined;
  const rawResult = j.result;
  let parsedResult: BackupJobClientView['result'] | undefined;
  if (rawResult != null && typeof rawResult === 'object') {
    const r = rawResult as Record<string, unknown>;
    const folderId = typeof r.folderId === 'string' ? r.folderId : '';
    const filePath = typeof r.filePath === 'string' ? r.filePath : '';
    const sizeBytes = typeof r.sizeBytes === 'number' ? r.sizeBytes : 0;
    const prunedCount = typeof r.prunedCount === 'number' ? r.prunedCount : 0;
    if (folderId !== '' && filePath !== '') {
      parsedResult = { folderId, filePath, sizeBytes, prunedCount };
    }
  }
  return {
    status,
    progress,
    totalItems,
    processedItems,
    ...(currentPhase !== undefined ? { currentPhase } : {}),
    ...(failureMessage !== undefined ? { failureMessage } : {}),
    ...(parsedResult !== undefined ? { result: parsedResult } : {}),
  };
}

export function backupPhaseDisplayLabel(phase: string | undefined): string {
  if (phase == null || phase === '') {
    return 'Starting backup…';
  }
  switch (phase) {
    case 'queued':
      return 'Queued on server…';
    case 'mongo_export':
      return 'Exporting MongoDB…';
    case 'minio_archive':
      return 'Archiving object storage…';
    case 'zip_finalize':
      return 'Compressing archive…';
    case 'upload':
      return 'Writing archive to local storage…';
    case 'retention':
      return 'Applying retention policy…';
    case 'done':
      return 'Finishing…';
    case 'failed':
      return 'Failed';
    default:
      return `Backup (${phase})…`;
  }
}

export function renderBackupJobProgressMessage(job: BackupJobClientView): ReactElement {
  const percent = Math.min(100, Math.max(0, Number.isFinite(job.progress) ? job.progress : 0));
  const phaseLabel = backupPhaseDisplayLabel(job.currentPhase);
  return (
    <Stack gap={6}>
      <Text size="sm">{phaseLabel}</Text>
      <Progress value={percent} radius="md" size="sm" />
      <Text size="xs" c="dimmed">
        Stage {Math.min(job.totalItems, Math.max(0, job.processedItems))}/{job.totalItems}
        {job.currentPhase != null && job.currentPhase !== '' ? ` • ${job.currentPhase}` : ''}
      </Text>
    </Stack>
  );
}

export function renderBackupJobSuccessMessage(result: NonNullable<BackupJobClientView['result']>): ReactElement {
  return (
    <Stack gap={8}>
      <Text size="sm" fw={600}>
        Full backup written to local path
      </Text>
      <Text size="sm">
        Folder id:{' '}
        <Text component="span" ff="monospace" fz="xs">
          {result.folderId}
        </Text>
      </Text>
      <Text size="sm">
        File path:{' '}
        <Text component="span" ff="monospace" fz="xs">
          {result.filePath}
        </Text>
      </Text>
      <Text size="sm">Archive size: {formatBackupBytes(result.sizeBytes)}</Text>
      <Progress value={100} radius="md" size="sm" />
      <Text size="xs" c="dimmed">
        Retention removed {result.prunedCount} older backup{result.prunedCount === 1 ? '' : 's'}.
      </Text>
    </Stack>
  );
}

export async function pollAdminBackupJobWithNotifications(
  jobId: string,
  notificationId: string,
  onComplete?: () => void | Promise<void>,
): Promise<void> {
  const startedAt = Date.now();
  const timeoutMs = 60 * 60 * 1000;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await api.getAdminBackupJob(jobId);
      const job = parseBackupJob((response as { job: unknown }).job);
      if (job == null) {
        notifications.update({
          id: notificationId,
          color: 'red',
          title: 'Backup status error',
          message: 'Invalid backup job response.',
          loading: false,
          autoClose: false,
          withCloseButton: true,
          position: LONG_TASK_NOTIFICATION_POSITION,
        });
        return;
      }
      if (job.status === 'completed') {
        try {
          await onComplete?.();
        } catch (completeErr) {
          console.error('onComplete after backup failed:', completeErr);
        }
        const res = job.result;
        notifications.update({
          id: notificationId,
          color: 'green',
          title: 'Backup complete',
          message:
            res != null ? (
              renderBackupJobSuccessMessage(res)
            ) : (
              'Backup finished (no result payload returned).'
            ),
          loading: false,
          autoClose: 9000,
          withCloseButton: true,
          position: LONG_TASK_NOTIFICATION_POSITION,
        });
        return;
      }
      if (job.status === 'failed') {
        notifications.update({
          id: notificationId,
          color: 'red',
          title: 'Backup failed',
          message: job.failureMessage ?? 'Backup failed before completion.',
          loading: false,
          autoClose: false,
          withCloseButton: true,
          position: LONG_TASK_NOTIFICATION_POSITION,
        });
        return;
      }
      notifications.update({
        id: notificationId,
        color: 'blue',
        title: 'Backup in progress',
        message: renderBackupJobProgressMessage(job),
        loading: true,
        autoClose: false,
        withCloseButton: false,
        position: LONG_TASK_NOTIFICATION_POSITION,
      });
    } catch {
      notifications.update({
        id: notificationId,
        color: 'red',
        title: 'Backup status error',
        message: 'Failed to check backup job status.',
        loading: false,
        autoClose: false,
        withCloseButton: true,
        position: LONG_TASK_NOTIFICATION_POSITION,
      });
      return;
    }
    await wait(2000);
  }
  notifications.update({
    id: notificationId,
    color: 'orange',
    title: 'Backup delayed',
    message: 'Backup is taking longer than expected. Check the job id or try again later.',
    loading: false,
    autoClose: false,
    withCloseButton: true,
    position: LONG_TASK_NOTIFICATION_POSITION,
  });
}
