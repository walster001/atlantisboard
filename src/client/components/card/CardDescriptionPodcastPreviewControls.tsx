import { ActionIcon, Group, Slider, UnstyledButton } from '@mantine/core';
import {
  IconPlayerPlayFilled,
  IconRewindBackward10,
  IconRewindForward10,
  IconVolume,
} from '@tabler/icons-react';
import type { ReactElement } from 'react';

export function CardDescriptionPodcastPreviewControls(): ReactElement {
  const iconStyle = {
    width: 'var(--audio-icon-size, 18px)',
    height: 'var(--audio-icon-size, 18px)',
  } as const;

  return (
    <Group
      className="card-desc-audio-podcast__controls"
      justify="space-between"
      wrap="nowrap"
      gap="xs"
      style={{ width: '100%', minWidth: 0 }}
    >
      <Group className="card-desc-audio-podcast__controls-cluster" gap="xs" wrap="nowrap">
        <ActionIcon
          className="card-desc-audio-podcast__action-button"
          variant="subtle"
          color="gray"
          radius="sm"
          disabled
          tabIndex={-1}
          aria-hidden
        >
          <IconRewindBackward10 stroke={1.75} style={iconStyle} />
        </ActionIcon>
        <ActionIcon
          className="card-desc-audio-podcast__play-button"
          variant="subtle"
          color="gray"
          radius="sm"
          disabled
          tabIndex={-1}
          aria-hidden
        >
          <IconPlayerPlayFilled stroke={1.75} style={iconStyle} />
        </ActionIcon>
        <ActionIcon
          className="card-desc-audio-podcast__action-button"
          variant="subtle"
          color="gray"
          radius="sm"
          disabled
          tabIndex={-1}
          aria-hidden
        >
          <IconRewindForward10 stroke={1.75} style={iconStyle} />
        </ActionIcon>
      </Group>
      <Group className="card-desc-audio-podcast__controls-cluster" gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
        <ActionIcon
          className="card-desc-audio-podcast__action-button"
          variant="subtle"
          color="gray"
          radius="sm"
          disabled
          tabIndex={-1}
          aria-hidden
        >
          <IconVolume stroke={1.75} style={iconStyle} />
        </ActionIcon>
        <Slider
          className="card-desc-audio-podcast__volume-slider"
          value={100}
          size="xs"
          disabled
          tabIndex={-1}
          aria-hidden
          styles={{
            root: { flex: '0 0 auto', width: 'var(--audio-volume-slider-width, 90px)' },
            bar: { backgroundColor: 'var(--audio-color, var(--mantine-color-blue-filled))' },
            thumb: {
              backgroundColor: 'var(--audio-color, var(--mantine-color-blue-filled))',
              borderColor: 'var(--audio-color, var(--mantine-color-blue-filled))',
              width: 'var(--audio-timeline-thumb-size, 12px)',
              height: 'var(--audio-timeline-thumb-size, 12px)',
            },
          }}
        />
        <UnstyledButton
          className="card-desc-audio-podcast__speed-control"
          disabled
          tabIndex={-1}
          aria-hidden
        >
          1×
        </UnstyledButton>
      </Group>
    </Group>
  );
}
