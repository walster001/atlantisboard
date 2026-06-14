import { Text } from '@mantine/core';
import { useMemo, type CSSProperties, type ReactElement } from 'react';
import { resolveDescriptionDecorationImageSrc } from '../../utils/descriptionDecorationImageSrc.js';
import { CardDescriptionPodcastPreviewControls } from './CardDescriptionPodcastPreviewControls.js';
import { CardDescriptionPodcastPreviewTimeline } from './CardDescriptionPodcastPreviewTimeline.js';
import { CardDescriptionPodcastPreviewTimeDisplay } from './CardDescriptionPodcastPreviewTimeDisplay.js';
import {
  AUDIO_SKELETON_EXAMPLE_TIME,
  DEFAULT_AUDIO_BG_COLOR,
  DEFAULT_AUDIO_BUTTON_HOVER_COLOR,
  DEFAULT_AUDIO_TEXT_COLOR,
  audioPodcastAppearanceStyle,
} from './tiptapAudioDisplay.js';

const SKELETON_SHELL_LAYOUT: CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: 0,
};

export interface CardDescriptionAudioPodcastSkeletonProps {
  readonly displayTitle?: string;
  readonly displayDescription?: string;
  readonly coverSrc?: string | null;
  readonly textColor?: string;
  readonly bgColor?: string;
  readonly buttonHoverColor?: string;
}

/**
 * Pure CSS/HTML podcast player chrome for the description editor.
 * Visually matches the read-only mantine-audio player without mounting audio.
 */
export function CardDescriptionAudioPodcastSkeleton({
  displayTitle = '',
  displayDescription = '',
  coverSrc = null,
  textColor = DEFAULT_AUDIO_TEXT_COLOR,
  bgColor = DEFAULT_AUDIO_BG_COLOR,
  buttonHoverColor = DEFAULT_AUDIO_BUTTON_HOVER_COLOR,
}: CardDescriptionAudioPodcastSkeletonProps): ReactElement {
  const trimmedTitle = displayTitle.trim();
  const trimmedDescription = displayDescription.trim();
  const showMetaText = trimmedTitle !== '' || trimmedDescription !== '';

  const resolvedCoverSrc = useMemo(
    () => resolveDescriptionDecorationImageSrc(coverSrc),
    [coverSrc],
  );

  const appearanceStyle = useMemo(
    () => audioPodcastAppearanceStyle(textColor, bgColor, buttonHoverColor),
    [bgColor, buttonHoverColor, textColor],
  );

  return (
    <div
      className="card-desc-audio-player-inner card-desc-audio-player-shell card-desc-audio-player-shell--sized"
      style={SKELETON_SHELL_LAYOUT}
      aria-hidden="true"
    >
      <div
        className="card-desc-audio-player card-desc-audio-podcast card-desc-audio-podcast--skeleton"
        style={appearanceStyle}
      >
        <div className="card-desc-audio-podcast__layout">
          {resolvedCoverSrc != null ? (
            <div className="card-desc-audio-podcast__cover">
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
                  {trimmedTitle !== '' ? (
                    <Text component="div" className="card-desc-audio-podcast__title">
                      {trimmedTitle}
                    </Text>
                  ) : null}
                  {trimmedDescription !== '' ? (
                    <Text component="div" className="card-desc-audio-podcast__description">
                      {trimmedDescription}
                    </Text>
                  ) : null}
                </div>
              ) : null}
              <CardDescriptionPodcastPreviewTimeDisplay timeLabel={AUDIO_SKELETON_EXAMPLE_TIME} />
            </div>
            <CardDescriptionPodcastPreviewTimeline />
            <CardDescriptionPodcastPreviewControls />
          </div>
        </div>
      </div>
    </div>
  );
}
