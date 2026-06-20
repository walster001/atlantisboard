import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { extractAttachmentIdFromMediaSrc } from '../../../shared/cardDescriptionAttachmentRefs.js';
import { useCardDescriptionVideoPlayback } from '../../hooks/card/useCardDescriptionVideoPlayback.js';
import { useVideoPosterUrl } from '../../hooks/useVideoPosterUrl.js';
import { isPendingDescriptionMediaSrc } from '../../utils/descriptionPendingMedia.js';
import { safeVideoPlay } from '../../utils/safeVideoPlay.js';
import { CardDescriptionVideoMediaToolbar } from './CardDescriptionVideoMediaToolbar.js';
import { VideoPlayOverlay } from './VideoPlayOverlay.js';
import './cardDescriptionVideoQuality.css';

export interface CardDescriptionVideoPlayerProps {
  readonly src: string;
  readonly poster?: string | null;
  readonly className?: string;
  readonly title?: string;
  /** When true, clicks do not bubble to card-description "tap to edit" handlers. */
  readonly isolateDescriptionClicks?: boolean;
}

function shellAspectRatioStyle(): CSSProperties {
  return { aspectRatio: '16 / 9' };
}

/**
 * Embedded card-description / attachment-preview video — resolves presigned MinIO URLs for attachments.
 */
export function CardDescriptionVideoPlayer({
  src,
  poster,
  className,
  title,
  isolateDescriptionClicks = true,
}: CardDescriptionVideoPlayerProps) {
  const attachmentId = extractAttachmentIdFromMediaSrc(src);
  const {
    playbackSrc,
    quality,
    qualityMeta,
    usesAdaptiveStreaming,
    playbackReady,
    setQuality,
    attachPlaybackToVideo,
    detachPlaybackFromVideo,
    fallbackToProxyOnError,
  } = useCardDescriptionVideoPlayback(src);
  const [posterVisible, setPosterVisible] = useState(true);
  const [blobSrcUnavailable, setBlobSrcUnavailable] = useState(false);
  const posterObjectUrl = useVideoPosterUrl(src, poster ?? undefined);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video == null || !playbackReady) {
      return;
    }
    attachPlaybackToVideo(video);
    return () => {
      detachPlaybackFromVideo();
    };
  }, [attachPlaybackToVideo, detachPlaybackFromVideo, playbackReady, playbackSrc, usesAdaptiveStreaming]);

  const stopDescriptionEditClick = useCallback(
    (event: MouseEvent | PointerEvent): void => {
      if (isolateDescriptionClicks) {
        event.stopPropagation();
      }
    },
    [isolateDescriptionClicks],
  );

  const handleVideoError = useCallback((): void => {
    if (src.trim().startsWith('blob:')) {
      setBlobSrcUnavailable(true);
      return;
    }
    fallbackToProxyOnError();
  }, [fallbackToProxyOnError, src]);

  const handlePlayRequest = useCallback(
    (event: MouseEvent<HTMLButtonElement>): void => {
      stopDescriptionEditClick(event);
      event.stopPropagation();
      if (!playbackReady) {
        return;
      }
      safeVideoPlay(videoRef.current);
    },
    [playbackReady, stopDescriptionEditClick],
  );

  if (blobSrcUnavailable) {
    return null;
  }

  const showPoster = posterObjectUrl != null && posterVisible;
  const showPlayAffordance = posterVisible;
  const hasCustomToolbar =
    attachmentId != null && !isPendingDescriptionMediaSrc(playbackSrc !== '' ? playbackSrc : src);
  const showCustomToolbar = hasCustomToolbar && !posterVisible;
  const shellStyle = showPoster ? shellAspectRatioStyle() : undefined;

  return (
    <div
      ref={shellRef}
      className={[
        'card-desc-video-player-shell',
        showCustomToolbar ? 'card-desc-video-player-shell--custom-toolbar' : null,
        showPoster ? 'card-desc-video-player-shell--has-poster' : null,
      ]
        .filter(Boolean)
        .join(' ')}
      style={shellStyle}
      onClick={stopDescriptionEditClick}
      onPointerDown={stopDescriptionEditClick}
    >
      {showPoster ? (
        <img
          className="card-desc-video-poster-overlay"
          src={posterObjectUrl}
          alt=""
          aria-hidden
          decoding="async"
        />
      ) : null}
      {showPlayAffordance ? (
        hasCustomToolbar ? (
          <button
            type="button"
            className="card-desc-video-play-trigger"
            aria-label="Play video"
            disabled={!playbackReady}
            onClick={handlePlayRequest}
          >
            <VideoPlayOverlay size="lg" />
          </button>
        ) : (
          <VideoPlayOverlay size="lg" />
        )
      ) : null}
      <video
        ref={videoRef}
        className={className}
        controls={!hasCustomToolbar}
        playsInline
        preload={playbackReady ? 'metadata' : 'none'}
        {...(usesAdaptiveStreaming || !playbackReady ? {} : { src: playbackSrc })}
        title={title}
        onPlay={() => setPosterVisible(false)}
        onError={handleVideoError}
      />
      {showCustomToolbar ? (
        <CardDescriptionVideoMediaToolbar
          videoRef={videoRef}
          shellRef={shellRef}
          mediaKey={usesAdaptiveStreaming ? src : playbackSrc}
          quality={quality}
          qualityMeta={qualityMeta}
          onQualityChange={setQuality}
          onDescriptionClickCapture={stopDescriptionEditClick}
        />
      ) : null}
    </div>
  );
}
