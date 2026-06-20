import { useCallback, useEffect, useMemo, useState } from 'react';
import { extractAttachmentIdFromMediaSrc } from '../../../shared/cardDescriptionAttachmentRefs.js';
import type {
  VideoAttachmentQualityMeta,
  VideoQualityPreference,
} from '../../../shared/videoQuality.js';
import { api } from '../../utils/api.js';
import { resolveCardDescriptionVideoPlaybackUrl } from '../../utils/attachmentStreamUrlClient.js';
import { initialCardDescriptionMediaSrc } from '../../components/card/cardDescriptionMediaSrc.js';
import { useCardDescriptionVideoAbrEngine } from './useCardDescriptionVideoAbrEngine.js';

export interface CardDescriptionVideoPlaybackState {
  readonly proxySrc: string;
  readonly playbackSrc: string;
  readonly quality: VideoQualityPreference;
  readonly qualityMeta: VideoAttachmentQualityMeta | null;
  readonly usesAdaptiveStreaming: boolean;
  readonly playbackReady: boolean;
  readonly setQuality: (next: VideoQualityPreference) => void;
  readonly attachPlaybackToVideo: (video: HTMLVideoElement) => void;
  readonly detachPlaybackFromVideo: () => void;
  readonly fallbackToProxyOnError: () => void;
}

export function useCardDescriptionVideoPlayback(src: string): CardDescriptionVideoPlaybackState {
  const attachmentId = useMemo(() => extractAttachmentIdFromMediaSrc(src), [src]);
  const proxySrc = useMemo(() => initialCardDescriptionMediaSrc(src), [src]);
  const [quality, setQuality] = useState<VideoQualityPreference>('auto');
  const [qualityMeta, setQualityMeta] = useState<VideoAttachmentQualityMeta | null>(null);
  const [metaLoaded, setMetaLoaded] = useState(attachmentId == null);
  const [streamUrlLoaded, setStreamUrlLoaded] = useState(attachmentId == null);
  const [playbackSrc, setPlaybackSrc] = useState(() =>
    attachmentId == null ? initialCardDescriptionMediaSrc(src) : '',
  );

  const abrEngine = useCardDescriptionVideoAbrEngine({
    qualityMeta,
    progressiveSrc: playbackSrc !== '' ? playbackSrc : proxySrc,
    enabled: metaLoaded,
  });

  useEffect(() => {
    let cancelled = false;
    if (attachmentId == null) {
      setQualityMeta(null);
      setMetaLoaded(true);
      setStreamUrlLoaded(true);
      setPlaybackSrc(initialCardDescriptionMediaSrc(src));
      return () => {
        cancelled = true;
      };
    }

    setMetaLoaded(false);
    setStreamUrlLoaded(false);
    setQualityMeta(null);

    void api
      .getAttachmentVideoMeta(attachmentId)
      .then((meta) => {
        if (!cancelled) {
          setQualityMeta(meta);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQualityMeta(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMetaLoaded(true);
        }
      });

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
      })
      .finally(() => {
        if (!cancelled) {
          setStreamUrlLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attachmentId, proxySrc, src]);

  const usesAdaptiveStreaming = abrEngine.usesAdaptiveStreaming;
  const playbackReady =
    metaLoaded &&
    streamUrlLoaded &&
    (attachmentId == null || usesAdaptiveStreaming || playbackSrc.trim() !== '');

  useEffect(() => {
    abrEngine.applyQuality(quality, qualityMeta);
  }, [abrEngine, quality, qualityMeta]);

  const fallbackToProxyOnError = useCallback((): void => {
    if (proxySrc !== '' && playbackSrc !== proxySrc) {
      setPlaybackSrc(proxySrc);
      setQualityMeta((current) =>
        current == null
          ? current
          : {
              ...current,
              streaming: {
                ...current.streaming,
                ready: false,
                hlsManifestUrl: null,
                dashManifestUrl: null,
              },
            },
      );
    }
  }, [playbackSrc, proxySrc]);

  const attachPlaybackToVideo = useCallback(
    (video: HTMLVideoElement): void => {
      abrEngine.attach(video);
    },
    [abrEngine],
  );

  const detachPlaybackFromVideo = useCallback((): void => {
    abrEngine.detach();
  }, [abrEngine]);

  return {
    proxySrc,
    playbackSrc: usesAdaptiveStreaming ? '' : playbackSrc,
    quality,
    qualityMeta,
    usesAdaptiveStreaming,
    playbackReady,
    setQuality,
    attachPlaybackToVideo,
    detachPlaybackFromVideo,
    fallbackToProxyOnError,
  };
}
