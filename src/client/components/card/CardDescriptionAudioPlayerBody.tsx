import { Audio } from '@gfazioli/mantine-audio';
import { Box, Group, Text } from '@mantine/core';
import type { Ref } from 'react';
import type { MouseEvent } from 'react';
import {
  CardDescriptionPodcastVolumeSpeedControls,
  podcastControlButtonProps,
} from './CardDescriptionPodcastVolumeSpeedControls.js';

export interface CardDescriptionAudioPlayerBodyProps {
  readonly layoutRef: Ref<HTMLDivElement>;
  readonly resolvedCoverSrc: string | null;
  readonly displayTitle: string;
  readonly displayDescription: string;
  readonly showMetaText: boolean;
  readonly useCompactVolumeSpeed: boolean;
  readonly onDescriptionClickCapture: (event: MouseEvent) => void;
}

export function CardDescriptionAudioPlayerBody({
  layoutRef,
  resolvedCoverSrc,
  displayTitle,
  displayDescription,
  showMetaText,
  useCompactVolumeSpeed,
  onDescriptionClickCapture,
}: CardDescriptionAudioPlayerBodyProps) {
  return (
    <div ref={layoutRef} className="card-desc-audio-podcast__layout">
      {resolvedCoverSrc != null && resolvedCoverSrc.trim() !== '' ? (
        <div className="card-desc-audio-podcast__cover" aria-hidden="true">
          <img src={resolvedCoverSrc} alt="" className="card-desc-audio-podcast__cover-image" />
        </div>
      ) : null}
      <div className="card-desc-audio-podcast__body">
        <div
          className={[
            'card-desc-audio-podcast__meta',
            !showMetaText ? 'card-desc-audio-podcast__meta--time-only' : null,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {showMetaText ? (
            <div className="card-desc-audio-podcast__meta-text">
              {displayTitle !== '' ? (
                <Text component="div" className="card-desc-audio-podcast__title">
                  {displayTitle}
                </Text>
              ) : null}
              {displayDescription !== '' ? (
                <Text component="div" className="card-desc-audio-podcast__description">
                  {displayDescription}
                </Text>
              ) : null}
            </div>
          ) : null}
          <Audio.TimeDisplay className="card-desc-audio-podcast__time-display" ta="right" />
        </div>
        <Box className="card-desc-audio-podcast__timeline">
          <Audio.Timeline />
        </Box>
        <Group
          className="card-desc-audio-podcast__controls"
          justify="space-between"
          wrap="nowrap"
          gap="xs"
        >
          <Group className="card-desc-audio-podcast__controls-cluster" gap="xs" wrap="nowrap">
            <Audio.SkipButton
              seconds={-10}
              className="card-desc-audio-podcast__action-button"
              {...podcastControlButtonProps}
            />
            <Audio.PlayButton
              className="card-desc-audio-podcast__play-button"
              {...podcastControlButtonProps}
            />
            <Audio.SkipButton
              seconds={10}
              className="card-desc-audio-podcast__action-button"
              {...podcastControlButtonProps}
            />
          </Group>
          <CardDescriptionPodcastVolumeSpeedControls
            compact={useCompactVolumeSpeed}
            onDescriptionClickCapture={onDescriptionClickCapture}
          />
        </Group>
      </div>
    </div>
  );
}
