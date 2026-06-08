import { Stack, Text } from '@mantine/core';
import type { AdminFileStorageObjectEntry } from '../../../../shared/types/adminFileStorage.js';
import { entryPrimaryLabel, entryShowsStorageKey } from './helpers.js';

type FileStorageObjectNameProps = {
  readonly entry: AdminFileStorageObjectEntry;
  readonly monospace?: boolean;
};

export function FileStorageObjectName({ entry, monospace = false }: FileStorageObjectNameProps) {
  const primary = entryPrimaryLabel(entry);
  const showKey = entryShowsStorageKey(entry);

  return (
    <Stack gap={0}>
      <Text
        size="sm"
        lineClamp={1}
        {...(monospace && !showKey ? { ff: 'monospace' as const } : {})}
      >
        {primary}
      </Text>
      {showKey ? (
        <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>
          {entry.name}
        </Text>
      ) : null}
    </Stack>
  );
}
