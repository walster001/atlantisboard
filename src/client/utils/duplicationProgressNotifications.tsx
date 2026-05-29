import type { ReactElement } from 'react';
import { Progress, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { LONG_TASK_NOTIFICATION_POSITION, renderStartupProgressMessage } from './longTaskProgressNotifications.js';

const LIST_DUPLICATE_NOTIFICATION_ID = 'kanban-duplicate-list';
const CARD_DUPLICATE_NOTIFICATION_ID = 'kanban-duplicate-card';

function notificationId(kind: 'list' | 'card'): string {
  return kind === 'list' ? LIST_DUPLICATE_NOTIFICATION_ID : CARD_DUPLICATE_NOTIFICATION_ID;
}

function titleForKind(kind: 'list' | 'card'): string {
  return kind === 'list' ? 'Duplicating list' : 'Duplicating card';
}

function beginDuplicationProgress(kind: 'list' | 'card', label: string): () => void {
  const id = notificationId(kind);
  notifications.show({
    id,
    color: 'blue',
    title: titleForKind(kind),
    message: renderStartupProgressMessage(label, 8),
    loading: true,
    autoClose: false,
    withCloseButton: false,
    position: LONG_TASK_NOTIFICATION_POSITION,
  });

  let value = 8;
  const timer = setInterval(() => {
    value = Math.min(92, value + (value < 50 ? 6 : 3));
    notifications.update({
      id,
      color: 'blue',
      title: titleForKind(kind),
      message: renderStartupProgressMessage(label, value),
      loading: true,
      autoClose: false,
      withCloseButton: false,
      position: LONG_TASK_NOTIFICATION_POSITION,
    });
  }, 450);

  return () => {
    clearInterval(timer);
  };
}

function completeDuplicationProgress(kind: 'list' | 'card', message: string): void {
  notifications.update({
    id: notificationId(kind),
    color: 'green',
    title: kind === 'list' ? 'List duplicated' : 'Card duplicated',
    message,
    loading: false,
    autoClose: 4000,
    withCloseButton: true,
    position: LONG_TASK_NOTIFICATION_POSITION,
  });
}

function failDuplicationProgress(kind: 'list' | 'card', message: string): void {
  notifications.update({
    id: notificationId(kind),
    color: 'red',
    title: kind === 'list' ? 'Could not duplicate list' : 'Could not duplicate card',
    message,
    loading: false,
    autoClose: false,
    withCloseButton: true,
    position: LONG_TASK_NOTIFICATION_POSITION,
  });
}

export async function runDuplicationWithProgressNotification<T>(args: {
  readonly kind: 'list' | 'card';
  readonly label: string;
  readonly task: () => Promise<T>;
  readonly successMessage: string | ((result: T) => string);
}): Promise<T> {
  const stopProgress = beginDuplicationProgress(args.kind, args.label);
  try {
    const result = await args.task();
    const message =
      typeof args.successMessage === 'function' ? args.successMessage(result) : args.successMessage;
    completeDuplicationProgress(args.kind, message);
    return result;
  } catch (error) {
    failDuplicationProgress(
      args.kind,
      error instanceof Error ? error.message : 'Unknown error',
    );
    throw error;
  } finally {
    stopProgress();
  }
}

export function renderDuplicationProgressMessage(label: string, value: number): ReactElement {
  return renderStartupProgressMessage(label, value);
}
