import type { ReactElement } from 'react';
import { Progress, Stack, Text } from '@mantine/core';

/** Matches import/export long-running task notifications. */
export const LONG_TASK_NOTIFICATION_POSITION = 'bottom-right' as const;

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function renderStartupProgressMessage(label: string, value: number): ReactElement {
  return (
    <Stack gap={6}>
      <Text size="sm">{label}</Text>
      <Progress value={value} radius="md" size="sm" />
    </Stack>
  );
}
