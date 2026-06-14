import { Audio } from '@gfazioli/mantine-audio';
import { useResizeObserver } from '@mantine/hooks';
import {
  useCallback,
  useMemo,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import { isPendingDescriptionMediaSrc } from '../../utils/descriptionPendingMedia.js';
import { useCardDescriptionAudioPlaybackSrc } from '../../hooks/card/useCardDescriptionAudioPlaybackSrc.js';
import { useResolvedCardDescriptionMediaSrc } from '../../hooks/card/useResolvedCardDescriptionMediaSrc.js';
import { useResponsiveTier } from '../../hooks/useResponsiveTier.js';
import { CardDescriptionAudioPlayerBody } from './CardDescriptionAudioPlayerBody.js';
import { shouldUseCompactPodcastControls } from './cardDescriptionPodcastCompactControls.js';
import { initialCardDescriptionMediaSrc } from './cardDescriptionMediaSrc.js';
import {
  DEFAULT_AUDIO_BG_COLOR,
  DEFAULT_AUDIO_BUTTON_HOVER_COLOR,
  DEFAULT_AUDIO_TEXT_COLOR,
  audioPodcastAppearanceStyle,
} from './tiptapAudioDisplay.js';

export interface CardDescriptionAudioPlayerProps {
  readonly src: string;
  readonly className?: string;
  readonly shellClassName?: string;
  readonly shellStyle?: CSSProperties;
  /** Layout box applied via React `style` (width/height from saved attrs). */
  readonly shellLayoutStyle?: CSSProperties;
  readonly displayTitle?: string;
  readonly displayDescription?: string;
  readonly coverSrc?: string | null;
  readonly textColor?: string;
  readonly bgColor?: string;
  readonly buttonHoverColor?: string;
  readonly title?: string;
  /** When false, renders the player chrome without playback or control interaction (editor preview). */
  readonly interactive?: boolean;
  /** When true, clicks do not bubble to card-description "tap to edit" handlers. */
  readonly isolateDescriptionClicks?: boolean;
  /** Editor: double-click opens appearance modal. */
  readonly onEditRequest?: () => void;
}

/**
 * Embedded card-description audio — resolves presigned MinIO URLs for attachments.
 */
export function CardDescriptionAudioPlayer({
  src,
  className,
  shellClassName,
  shellStyle,
  shellLayoutStyle,
  displayTitle = '',
  displayDescription = '',
  coverSrc = null,
  textColor = DEFAULT_AUDIO_TEXT_COLOR,
  bgColor = DEFAULT_AUDIO_BG_COLOR,
  buttonHoverColor = DEFAULT_AUDIO_BUTTON_HOVER_COLOR,
  title,
  interactive = true,
  isolateDescriptionClicks = true,
  onEditRequest,
}: CardDescriptionAudioPlayerProps) {
  const proxySrc = useMemo(() => initialCardDescriptionMediaSrc(src), [src]);
  const { playbackSrc, fallbackToProxyOnError } = useCardDescriptionAudioPlaybackSrc(src, interactive);
  const resolvedCoverSrc = useResolvedCardDescriptionMediaSrc(coverSrc, interactive);
  const responsiveTier = useResponsiveTier();
  const [layoutRef, layoutRect] = useResizeObserver<HTMLDivElement>();

  const handleAudioError = useCallback((): void => {
    fallbackToProxyOnError();
  }, [fallbackToProxyOnError]);

  const stopDescriptionEditClick = useCallback(
    (event: MouseEvent): void => {
      if (isolateDescriptionClicks) {
        event.stopPropagation();
      }
    },
    [isolateDescriptionClicks],
  );

  const handleDoubleClick = useCallback(
    (event: MouseEvent): void => {
      if (onEditRequest == null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onEditRequest();
    },
    [onEditRequest],
  );

  const mergedShellStyle = useMemo((): CSSProperties | undefined => {
    if (shellLayoutStyle == null && shellStyle == null) {
      return undefined;
    }
    return {
      ...(shellStyle ?? {}),
      ...(shellLayoutStyle ?? {}),
    };
  }, [shellLayoutStyle, shellStyle]);

  const appearanceStyle = useMemo(
    () => audioPodcastAppearanceStyle(textColor, bgColor, buttonHoverColor),
    [bgColor, buttonHoverColor, textColor],
  );

  if (playbackSrc.trim() === '') {
    return null;
  }

  const fallbackSrc = proxySrc !== '' && proxySrc !== playbackSrc ? proxySrc : undefined;
  const playerClassName = [
    className != null && className.trim() !== '' ? className : 'card-desc-audio-player',
    'card-desc-audio-podcast',
  ]
    .filter(Boolean)
    .join(' ');
  const hasExplicitHeight =
    shellLayoutStyle?.height != null || shellLayoutStyle?.minHeight != null;
  const trimmedTitle = displayTitle.trim();
  const trimmedDescription = displayDescription.trim();
  const showMetaText = trimmedTitle !== '' || trimmedDescription !== '';
  const isBlobPlaybackSrc = isPendingDescriptionMediaSrc(playbackSrc);
  const hasCover = resolvedCoverSrc != null && resolvedCoverSrc.trim() !== '';
  const useCompactVolumeSpeed = shouldUseCompactPodcastControls({
    tier: responsiveTier,
    layoutWidthPx: layoutRect.width,
    hasCover,
  });

  return (
    <div
      className={[
        shellClassName ?? 'card-desc-audio-player-shell',
        hasExplicitHeight ? 'card-desc-audio-player-shell--sized' : null,
        onEditRequest != null ? 'card-desc-audio-player-shell--editable' : null,
      ]
        .filter(Boolean)
        .join(' ')}
      {...(mergedShellStyle != null ? { style: mergedShellStyle } : {})}
      onClick={stopDescriptionEditClick}
      onDoubleClick={handleDoubleClick}
      {...(onEditRequest != null ? { title: 'Double-click to edit appearance' } : {})}
    >
      <Audio
        src={playbackSrc}
        {...(fallbackSrc != null ? { fallbackSrc } : {})}
        controls={false}
        {...(!isBlobPlaybackSrc ? { crossOrigin: 'anonymous' as const } : {})}
        preload={interactive ? 'metadata' : 'none'}
        className={playerClassName}
        style={appearanceStyle}
        {...(title != null ? { title } : {})}
        disableWebAudio
        onError={handleAudioError}
      >
        <CardDescriptionAudioPlayerBody
          layoutRef={layoutRef}
          resolvedCoverSrc={resolvedCoverSrc}
          displayTitle={trimmedTitle}
          displayDescription={trimmedDescription}
          showMetaText={showMetaText}
          useCompactVolumeSpeed={useCompactVolumeSpeed}
          onDescriptionClickCapture={stopDescriptionEditClick}
        />
      </Audio>
    </div>
  );
}
