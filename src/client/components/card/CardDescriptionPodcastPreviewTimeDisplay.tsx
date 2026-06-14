import { Text } from '@mantine/core';
import type { ReactElement } from 'react';

export interface CardDescriptionPodcastPreviewTimeDisplayProps {
  readonly timeLabel: string;
}

/** Static current/total time for editor and modal previews. */
export function CardDescriptionPodcastPreviewTimeDisplay({
  timeLabel,
}: CardDescriptionPodcastPreviewTimeDisplayProps): ReactElement {
  return (
    <Text
      component="span"
      className="card-desc-audio-podcast__time-display"
      ff="monospace"
      ta="right"
      aria-hidden
    >
      {timeLabel}
    </Text>
  );
}
