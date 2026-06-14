import { Slider } from '@mantine/core';
import type { ReactElement } from 'react';

/** Non-interactive seek bar matching mantine-audio `Audio.Timeline` chrome. */
export function CardDescriptionPodcastPreviewTimeline(): ReactElement {
  return (
    <div className="card-desc-audio-podcast__timeline">
      <Slider
        value={0}
        min={0}
        max={100}
        size="xs"
        disabled
        tabIndex={-1}
        aria-hidden
        styles={{
          root: { flex: 1, width: '100%' },
          bar: { backgroundColor: 'var(--audio-timeline-color, var(--audio-color))' },
          thumb: {
            backgroundColor: 'var(--audio-timeline-thumb-color, var(--audio-color))',
            borderColor: 'var(--audio-timeline-thumb-color, var(--audio-color))',
            width: 'var(--audio-timeline-thumb-size, 12px)',
            height: 'var(--audio-timeline-thumb-size, 12px)',
          },
        }}
      />
    </div>
  );
}
