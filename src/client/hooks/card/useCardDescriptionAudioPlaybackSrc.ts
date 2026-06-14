import { useCallback, useEffect, useMemo, useState } from 'react';
import { extractAttachmentIdFromMediaSrc } from '../../../shared/cardDescriptionAttachmentRefs.js';
import { initialCardDescriptionMediaSrc } from '../../components/card/cardDescriptionMediaSrc.js';
import { resolveCardDescriptionVideoPlaybackUrl } from '../../utils/attachmentStreamUrlClient.js';

export interface CardDescriptionAudioPlaybackSrc {
  readonly playbackSrc: string;
  readonly fallbackToProxyOnError: () => void;
}

export function useCardDescriptionAudioPlaybackSrc(
  src: string,
  interactive: boolean,
): CardDescriptionAudioPlaybackSrc {
  const attachmentId = useMemo(() => extractAttachmentIdFromMediaSrc(src), [src]);
  const proxySrc = useMemo(() => initialCardDescriptionMediaSrc(src), [src]);
  const [playbackSrc, setPlaybackSrc] = useState(() =>
    attachmentId == null ? initialCardDescriptionMediaSrc(src) : '',
  );

  useEffect(() => {
    let cancelled = false;

    if (!interactive || attachmentId == null) {
      setPlaybackSrc(initialCardDescriptionMediaSrc(src));
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
  }, [attachmentId, interactive, proxySrc, src]);

  const fallbackToProxyOnError = useCallback((): void => {
    if (proxySrc !== '' && playbackSrc !== proxySrc) {
      setPlaybackSrc(proxySrc);
    }
  }, [playbackSrc, proxySrc]);

  return { playbackSrc, fallbackToProxyOnError };
}
