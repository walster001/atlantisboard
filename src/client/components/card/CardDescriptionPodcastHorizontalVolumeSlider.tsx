import { Slider } from '@mantine/core';
import { useCallback } from 'react';
import { useCardDescriptionPodcastVolume } from './useCardDescriptionPodcastVolume.js';

export function CardDescriptionPodcastHorizontalVolumeSlider({
  className,
}: {
  readonly className?: string;
}) {
  const { volumePercent, setVolumePercent } = useCardDescriptionPodcastVolume();

  const handleChange = useCallback(
    (next: number) => {
      setVolumePercent(next);
    },
    [setVolumePercent],
  );

  return (
    <Slider
      value={volumePercent}
      onChange={handleChange}
      min={0}
      max={100}
      step={1}
      label={(value) => `${value}%`}
      showLabelOnHover
      size="xs"
      aria-label="Volume"
      {...(className != null ? { className } : {})}
      styles={{
        bar: { backgroundColor: 'var(--audio-color)' },
        thumb: {
          backgroundColor: 'var(--audio-color)',
          borderColor: 'var(--audio-color)',
          width: 'var(--audio-timeline-thumb-size)',
          height: 'var(--audio-timeline-thumb-size)',
        },
      }}
    />
  );
}
