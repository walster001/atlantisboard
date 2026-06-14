import { Audio, useAudioContext } from '@gfazioli/mantine-audio';
import { ActionIcon, Group, Popover } from '@mantine/core';
import {
  IconVolume,
  IconVolume2,
  IconVolume3,
} from '@tabler/icons-react';
import { useCallback, useRef, useState, type MouseEvent } from 'react';
import { CardDescriptionPodcastVerticalVolumeSlider } from './CardDescriptionPodcastVerticalVolumeSlider.js';

export const podcastControlButtonProps = {
  variant: 'subtle' as const,
  color: 'gray',
};

type PodcastControlButtonProps = typeof podcastControlButtonProps;

function CardDescriptionPodcastCompactVolumeButton({
  buttonProps,
  onDescriptionClickCapture,
}: {
  readonly buttonProps: PodcastControlButtonProps;
  readonly onDescriptionClickCapture?: (event: MouseEvent) => void;
}) {
  const [opened, setOpened] = useState(false);
  const [isVolumeDragging, setIsVolumeDragging] = useState(false);
  const ignoreCloseRef = useRef(false);
  const ctx = useAudioContext();
  const value = ctx.muted ? 0 : Math.round(ctx.volume * 100);

  const iconStyle = {
    width: 'var(--audio-icon-size, 18px)',
    height: 'var(--audio-icon-size, 18px)',
  } as const;

  const handleVolumeButtonClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      onDescriptionClickCapture?.(event);
      event.stopPropagation();
      setOpened((current) => !current);
    },
    [onDescriptionClickCapture],
  );

  const handleVolumeChange = useCallback(
    (next: number) => {
      ctx.setVolume(next / 100);
    },
    [ctx],
  );

  const handlePopoverChange = useCallback((next: boolean) => {
    if (!next && (isVolumeDragging || ignoreCloseRef.current)) {
      return;
    }
    setOpened(next);
  }, [isVolumeDragging]);

  const handleVolumeDragChange = useCallback((dragging: boolean) => {
    ignoreCloseRef.current = dragging;
    setIsVolumeDragging(dragging);
  }, []);

  const volumeIcon =
    ctx.muted || ctx.volume === 0 ? (
      <IconVolume3 stroke={1.75} style={iconStyle} />
    ) : ctx.volume < 0.5 ? (
      <IconVolume2 stroke={1.75} style={iconStyle} />
    ) : (
      <IconVolume stroke={1.75} style={iconStyle} />
    );

  return (
    <Popover
      opened={opened}
      onChange={handlePopoverChange}
      position="top"
      offset={10}
      withArrow
      withinPortal
      trapFocus={false}
      closeOnClickOutside={!isVolumeDragging}
      clickOutsideEvents={['mousedown']}
      zIndex={500}
    >
      <Popover.Target>
        <ActionIcon
          className="card-desc-audio-podcast__action-button card-desc-audio-podcast__volume-button"
          aria-label="Volume"
          aria-expanded={opened}
          aria-haspopup="dialog"
          data-state={ctx.muted || ctx.volume === 0 ? 'muted' : 'unmuted'}
          onClick={handleVolumeButtonClick}
          {...buttonProps}
        >
          {volumeIcon}
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown className="card-desc-audio-podcast__volume-popover">
        <CardDescriptionPodcastVerticalVolumeSlider
          value={value}
          onChange={handleVolumeChange}
          onDragChange={handleVolumeDragChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

export interface CardDescriptionPodcastVolumeSpeedControlsProps {
  readonly compact: boolean;
  readonly onDescriptionClickCapture?: (event: MouseEvent) => void;
}

export function CardDescriptionPodcastVolumeSpeedControls({
  compact,
  onDescriptionClickCapture,
}: CardDescriptionPodcastVolumeSpeedControlsProps) {
  const buttonProps = podcastControlButtonProps;

  if (compact) {
    return (
      <Group
        className="card-desc-audio-podcast__controls-cluster card-desc-audio-podcast__controls-cluster--compact-secondary"
        gap="xs"
        wrap="nowrap"
      >
        <CardDescriptionPodcastCompactVolumeButton
          buttonProps={buttonProps}
          {...(onDescriptionClickCapture != null
            ? { onDescriptionClickCapture }
            : {})}
        />
        <Audio.SpeedControl menuProps={{ position: 'top', withinPortal: true }} />
      </Group>
    );
  }

  return (
    <Group
      className="card-desc-audio-podcast__controls-cluster card-desc-audio-podcast__controls-cluster--secondary"
      gap="xs"
      wrap="nowrap"
    >
      <Audio.MuteButton
        className="card-desc-audio-podcast__action-button"
        {...buttonProps}
      />
      <Audio.VolumeSlider className="card-desc-audio-podcast__volume-slider" />
      <Audio.SpeedControl />
    </Group>
  );
}
