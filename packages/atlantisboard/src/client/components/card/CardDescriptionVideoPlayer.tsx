import { useEffect, useMemo, useState } from 'react';
import { extractAttachmentIdFromMediaSrc } from '../../../shared/cardDescriptionAttachmentRefs.js';
import { api } from '../../utils/api.js';
import { ensureAttachmentStreamUrl } from '../../utils/attachmentStreamUrlClient.js';

export interface CardDescriptionVideoPlayerProps {
  readonly src: string;
  readonly className?: string;
  readonly title?: string;
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
 * Embedded card-description / attachment-preview video with stream URL resolution and proxy fallback.
 */
export function CardDescriptionVideoPlayer({
  src,
  className,
  title,
}: CardDescriptionVideoPlayerProps) {
  const attachmentId = useMemo(() => extractAttachmentIdFromMediaSrc(src), [src]);
  const proxySrc = useMemo(() => initialPlaybackSrc(src), [src]);
  const [playbackSrc, setPlaybackSrc] = useState(proxySrc);

  useEffect(() => {
    setPlaybackSrc(proxySrc);
  }, [proxySrc]);

  useEffect(() => {
    if (attachmentId == null) {
      return;
    }
    let cancelled = false;
    void ensureAttachmentStreamUrl(attachmentId)
      .then((entry) => {
        if (cancelled || entry.url.trim() === '') {
          return;
        }
        if (entry.delivery === 'signed') {
          setPlaybackSrc(entry.url);
        }
      })
      .catch(() => {
        /* Keep proxy URL */
      });
    return () => {
      cancelled = true;
    };
  }, [attachmentId]);

  const handleVideoError = (): void => {
    if (proxySrc !== '' && playbackSrc !== proxySrc) {
      setPlaybackSrc(proxySrc);
    }
  };

  if (playbackSrc.trim() === '') {
    return null;
  }

  return (
    <video
      className={className}
      controls
      playsInline
      preload="metadata"
      src={playbackSrc}
      title={title}
      onError={handleVideoError}
    />
  );
}
