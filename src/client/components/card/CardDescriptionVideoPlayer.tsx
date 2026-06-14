import { useCallback, useEffect, useMemo, useState, type MouseEvent, type PointerEvent } from 'react';
import { extractAttachmentIdFromMediaSrc } from '../../../shared/cardDescriptionAttachmentRefs.js';
import { useVideoPosterUrl } from '../../hooks/useVideoPosterUrl.js';
import { api } from '../../utils/api.js';
import { resolveCardDescriptionVideoPlaybackUrl } from '../../utils/attachmentStreamUrlClient.js';

export interface CardDescriptionVideoPlayerProps {
  readonly src: string;
  readonly poster?: string | null;
  readonly className?: string;
  readonly title?: string;
  /** When true, clicks do not bubble to card-description "tap to edit" handlers. */
  readonly isolateDescriptionClicks?: boolean;
}

function attachmentProxyPath(attachmentId: string): string {
  const fromApi = api.getAttachmentFileUrl(attachmentId);
  if (fromApi.startsWith('/')) {
    return fromApi;
  }
  try {
    const parsed = new URL(fromApi);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fromApi;
  }
}

function initialPlaybackSrc(storedSrc: string): string {
  const trimmed = storedSrc.trim();
  if (trimmed === '') {
    return '';
  }
  if (trimmed.startsWith('blob:')) {
    return trimmed;
  }
  const attachmentId = extractAttachmentIdFromMediaSrc(trimmed);
  if (attachmentId != null) {
    return attachmentProxyPath(attachmentId);
  }
  const resolved = api.resolveAttachmentUrl(trimmed);
  if (resolved.startsWith('/')) {
    return resolved;
  }
  try {
    const parsed = new URL(resolved);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return resolved;
  }
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
  const attachmentId = useMemo(() => extractAttachmentIdFromMediaSrc(src), [src]);
  const proxySrc = useMemo(() => initialPlaybackSrc(src), [src]);
  const [playbackSrc, setPlaybackSrc] = useState(() =>
    attachmentId == null ? initialPlaybackSrc(src) : '',
  );
  const [posterVisible, setPosterVisible] = useState(true);
  const posterObjectUrl = useVideoPosterUrl(src, poster ?? undefined);

  useEffect(() => {
    let cancelled = false;
    setPosterVisible(true);

    if (attachmentId == null) {
      setPlaybackSrc(initialPlaybackSrc(src));
      return () => {
        cancelled = true;
      };
    }

    setPlaybackSrc('');
    void resolveCardDescriptionVideoPlaybackUrl(src)
      .then((url) => {
        if (!cancelled) {
          setPlaybackSrc(url.trim() !== '' ? url : proxySrc);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlaybackSrc(proxySrc);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attachmentId, proxySrc, src]);

  const handleVideoError = (): void => {
    if (proxySrc !== '' && playbackSrc !== proxySrc) {
      setPlaybackSrc(proxySrc);
    }
  };

  const stopDescriptionEditClick = useCallback(
    (event: MouseEvent | PointerEvent): void => {
      if (isolateDescriptionClicks) {
        event.stopPropagation();
      }
    },
    [isolateDescriptionClicks],
  );

  if (playbackSrc.trim() === '') {
    return null;
  }

  const showPoster = posterObjectUrl != null && posterVisible;

  return (
    <div
      className="card-desc-video-player-shell"
      onClick={stopDescriptionEditClick}
      onPointerDown={stopDescriptionEditClick}
    >
      {showPoster ? (
        <img
          className="card-desc-video-poster-overlay"
          src={posterObjectUrl}
          alt=""
          aria-hidden
        />
      ) : null}
      <video
        className={className}
        controls
        playsInline
        preload="metadata"
        src={playbackSrc}
        title={title}
        onPlay={() => setPosterVisible(false)}
        onError={handleVideoError}
      />
    </div>
  );
}
