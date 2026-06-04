import type { ReactElement } from 'react';
import { Badge, Group } from '@mantine/core';

export function ImportPlaceholderBadges(props: {
  readonly importPlaceholder?: boolean | undefined;
  readonly importNotMapped?: boolean | undefined;
}): ReactElement | null {
  if (props.importPlaceholder !== true) {
    return null;
  }
  return (
    <Group gap={4} wrap="wrap">
      <Badge size="xs" variant="light" color="grape">
        Imported
      </Badge>
      {props.importNotMapped === true ? (
        <Badge size="xs" variant="light" color="orange">
          Not Mapped
        </Badge>
      ) : null}
    </Group>
  );
}
