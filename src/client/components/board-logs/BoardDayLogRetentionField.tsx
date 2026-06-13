import { Card, Group, Select, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconClock } from '@tabler/icons-react';

interface BoardDayLogRetentionFieldProps {
  readonly ariaLabel: string;
  readonly retentionValue: string;
  readonly retentionSelectData: ReadonlyArray<{ value: string; label: string }>;
  readonly savingRetention: boolean;
  readonly onRetentionChange: (value: string | null) => void | Promise<void>;
  readonly compact?: boolean;
  readonly description?: string;
}

export function BoardDayLogRetentionField({
  ariaLabel,
  retentionValue,
  retentionSelectData,
  savingRetention,
  onRetentionChange,
  compact = false,
  description = 'Automatically delete old entries to manage database size',
}: BoardDayLogRetentionFieldProps) {
  const select = (
    <Select
      aria-label={ariaLabel}
      data={[...retentionSelectData]}
      value={retentionValue}
      onChange={(value) => {
        void onRetentionChange(value);
      }}
      disabled={savingRetention}
      w={{ base: '100%', sm: 200 }}
      miw={160}
    />
  );

  if (compact) {
    return (
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <Text fw={600} size="sm">
          Retention
        </Text>
        {select}
      </Group>
    );
  }

  return (
    <Card
      className="board-day-log__card board-day-log__retention"
      padding="md"
      radius="md"
      withBorder
      shadow="none"
    >
      <Group justify="space-between" align="center" wrap="nowrap" gap="md">
        <Group gap="md" wrap="nowrap" align="flex-start">
          <ThemeIcon size="lg" radius="md" variant="light" color="gray" aria-hidden>
            <IconClock size={20} stroke={1.5} />
          </ThemeIcon>
          <Stack gap={2}>
            <Text fw={600} size="sm">
              Log Retention
            </Text>
            {description !== '' ? (
              <Text size="xs" c="dimmed">
                {description}
              </Text>
            ) : null}
          </Stack>
        </Group>
        {select}
      </Group>
    </Card>
  );
}
