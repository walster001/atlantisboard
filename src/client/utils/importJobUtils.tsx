import type { ReactElement } from 'react';
import { Box, Paper, Progress, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api } from './api.js';
import {
  LONG_TASK_NOTIFICATION_POSITION,
  wait,
} from './longTaskProgressNotifications.js';

export type ImportType = 'trello' | 'wekan' | 'csv' | 'atlantisboard' | null;

export type ImportJobServerType = 'trello' | 'wekan' | 'csv' | 'atlantisboard';

export interface ImportJobClientView {
  status: string;
  type: ImportJobServerType;
  progress: number;
  totalItems: number;
  processedItems: number;
  currentPhase?: string;
  importErrors?: { item: string; error: string }[];
  result?: Record<string, unknown>;
}

export const IMPORT_PROGRESS_NOTIFICATION_ID = 'import-export-progress';

export const PANEL_SCROLL_AREA_STYLE = {
  flex: '1 1 0%',
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  paddingRight: 4,
} as const;

export const PANEL_FOOTER_STYLE = {
  borderTop: '1px solid var(--mantine-color-gray-3)',
  paddingTop: 'var(--mantine-spacing-sm)',
  marginTop: 'var(--mantine-spacing-sm)',
  backgroundColor: 'var(--mantine-color-body)',
  flexShrink: 0,
} as const;

export function parseImportJob(job: unknown): ImportJobClientView | null {
  if (job == null || typeof job !== 'object') {
    return null;
  }
  const j = job as Record<string, unknown>;
  const status = j.status;
  if (typeof status !== 'string') {
    return null;
  }
  const typeRaw = j.type;
  const type: ImportJobServerType =
    typeRaw === 'trello' || typeRaw === 'wekan' || typeRaw === 'csv' || typeRaw === 'atlantisboard'
      ? typeRaw
      : 'csv';
  const progress = typeof j.progress === 'number' ? j.progress : 0;
  const totalItems = typeof j.totalItems === 'number' ? j.totalItems : 0;
  const processedItems = typeof j.processedItems === 'number' ? j.processedItems : 0;
  const currentPhase = typeof j.currentPhase === 'string' ? j.currentPhase : undefined;
  const importErrors = Array.isArray(j.importErrors) ? (j.importErrors as { item: string; error: string }[]) : [];
  const result = j.result != null && typeof j.result === 'object' ? (j.result as Record<string, unknown>) : undefined;
  return {
    status,
    type,
    progress,
    totalItems,
    processedItems,
    importErrors,
    ...(currentPhase !== undefined ? { currentPhase } : {}),
    ...(result !== undefined ? { result } : {}),
  };
}

export function importPhaseDisplayLabel(phase: string | undefined): string {
  if (phase == null || phase.length === 0) {
    return 'Starting import…';
  }
  switch (phase) {
    case 'boards':
      return 'Importing boards…';
    case 'labels':
      return 'Importing boards and labels…';
    case 'lists':
      return 'Importing lists…';
    case 'cards':
      return 'Importing cards…';
    case 'done':
      return 'Finishing…';
    default:
      return `Importing (${phase})…`;
  }
}

export function buildImportSuccessMessage(
  importType: ImportType,
  jobType: ImportJobServerType,
  result: Record<string, unknown> | undefined,
): string {
  const source: ImportType = importType ?? jobType;
  if (source === 'trello' || source === 'wekan' || source === 'atlantisboard') {
    const boardName =
      result != null &&
      typeof result.boardName === 'string' &&
      result.boardName.trim().length > 0
        ? result.boardName.trim()
        : 'your board';
    const listCount = typeof result?.listCount === 'number' ? result.listCount : 0;
    const cardCount = typeof result?.cardCount === 'number' ? result.cardCount : 0;
    return `Successfully imported ${boardName} with ${listCount} list${listCount === 1 ? '' : 's'} and ${cardCount} card${cardCount === 1 ? '' : 's'}.`;
  }
  if (source === 'csv') {
    const msg = result != null && typeof result.message === 'string' ? result.message : undefined;
    return msg ?? 'Import completed.';
  }
  return 'Import completed.';
}

export function renderImportProgressNotificationMessage(job: ImportJobClientView): ReactElement {
  const percent = Math.min(100, Math.max(0, Number.isFinite(job.progress) ? job.progress : 0));
  const processed = Math.max(0, Number.isFinite(job.processedItems) ? job.processedItems : 0);
  const total = Math.max(0, Number.isFinite(job.totalItems) ? job.totalItems : 0);
  const phaseLabel = importPhaseDisplayLabel(job.currentPhase);
  return (
    <Stack gap={6}>
      <Text size="sm">{phaseLabel}</Text>
      <Progress value={percent} radius="md" size="sm" />
      <Text size="xs" c="dimmed">
        {processed}/{total} processed{job.currentPhase != null && job.currentPhase !== '' ? ` • phase: ${job.currentPhase}` : ''}
      </Text>
    </Stack>
  );
}

export function ImportMappingCallout({ importType }: { importType: ImportType }) {
  if (!importType) {
    return null;
  }

  const lines: { text: string; emphasis?: boolean }[] =
    importType === 'wekan'
      ? [
          { text: 'Wekan Boards → KanBoard Boards' },
          { text: 'Wekan Lists → KanBoard Columns' },
          { text: 'Wekan Cards → KanBoard Cards' },
          { text: 'Wekan Labels → KanBoard Labels' },
          { text: 'Wekan Checklists → KanBoard Subtasks' },
          { text: 'Members, attachments, comments are imported with preflight mapping', emphasis: true },
        ]
      : importType === 'trello'
        ? [
            { text: 'Trello Boards → KanBoard Workspaces / Boards' },
            { text: 'Trello Lists → KanBoard Columns' },
            { text: 'Trello Cards → KanBoard Cards' },
            { text: 'Trello Labels → KanBoard Labels' },
            { text: 'Trello Checklists → KanBoard Subtasks' },
            { text: 'Members, attachments, comments are imported with preflight mapping', emphasis: true },
          ]
        : importType === 'atlantisboard'
          ? [
              { text: 'Atlantisboard export → restored board in this workspace' },
              { text: 'Lists, cards, labels, checklists, and comments are preserved' },
              { text: 'Inline attachment data URLs are re-uploaded to storage', emphasis: true },
              { text: 'Users are mapped when they still exist; otherwise the importer is used', emphasis: true },
            ]
          : [
              { text: 'CSV / TSV rows → KanBoard Cards (this board)' },
              { text: 'Columns are mapped during import configuration' },
              { text: 'Attachments and rich metadata are not imported', emphasis: true },
            ];

  return (
    <Paper p="md" radius="md" bg="gray.0" withBorder>
      <Text fw={700} size="sm" mb="sm">
        Import Mapping:
      </Text>
      <Box component="ul" style={{ margin: 0, paddingLeft: '1.25rem' }}>
        {lines.map((line) => (
          <Box
            component="li"
            key={line.text}
            mb={4}
            style={{ listStyleType: 'disc' }}
          >
            <Text
              component="span"
              size="sm"
              c={line.emphasis ? 'orange.7' : 'dark.7'}
            >
              {line.text}
            </Text>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

export async function pollImportJobWithNotifications(
  jobId: string,
  importType: ImportType,
  onImportComplete?: () => void | Promise<void>,
): Promise<void> {
  const startedAt = Date.now();
  const timeoutMs = 15 * 60 * 1000;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await api.getImportJobStatus(jobId);
      const job = parseImportJob(response.job);
      if (job == null) {
        notifications.update({
          id: IMPORT_PROGRESS_NOTIFICATION_ID,
          color: 'red',
          title: 'Import status error',
          message: 'Invalid import job response.',
          loading: false,
          autoClose: false,
          withCloseButton: true,
          position: LONG_TASK_NOTIFICATION_POSITION,
        });
        return;
      }
      if (job.status === 'completed') {
        try {
          await onImportComplete?.();
        } catch (completeErr) {
          console.error('onImportComplete failed:', completeErr);
        }
        notifications.update({
          id: IMPORT_PROGRESS_NOTIFICATION_ID,
          color: 'green',
          title: 'Import complete',
          message: buildImportSuccessMessage(importType, job.type, job.result),
          loading: false,
          autoClose: 7000,
          withCloseButton: true,
          position: LONG_TASK_NOTIFICATION_POSITION,
        });
        return;
      }
      if (job.status === 'failed') {
        const errors = job.importErrors ?? [];
        notifications.update({
          id: IMPORT_PROGRESS_NOTIFICATION_ID,
          color: 'red',
          title: 'Import failed',
          message:
            errors.length > 0
              ? `Import failed with ${errors.length} error${errors.length === 1 ? '' : 's'}.`
              : 'Import failed before completion.',
          loading: false,
          autoClose: false,
          withCloseButton: true,
          position: LONG_TASK_NOTIFICATION_POSITION,
        });
        return;
      }
      notifications.update({
        id: IMPORT_PROGRESS_NOTIFICATION_ID,
        color: 'blue',
        title: 'Import in progress',
        message: renderImportProgressNotificationMessage(job),
        loading: true,
        autoClose: false,
        withCloseButton: false,
        position: LONG_TASK_NOTIFICATION_POSITION,
      });
    } catch {
      notifications.update({
        id: IMPORT_PROGRESS_NOTIFICATION_ID,
        color: 'red',
        title: 'Import status error',
        message: 'Failed to check import status.',
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
    id: IMPORT_PROGRESS_NOTIFICATION_ID,
    color: 'orange',
    title: 'Import delayed',
    message: 'Import is taking longer than expected. Please check back later.',
    loading: false,
    autoClose: false,
    withCloseButton: true,
    position: LONG_TASK_NOTIFICATION_POSITION,
  });
}
