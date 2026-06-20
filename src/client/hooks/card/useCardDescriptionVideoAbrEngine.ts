import { useCallback, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import * as dashjs from 'dashjs';
import {
  pickVideoAbrFormatForUserAgent,
  resolveAbrLevelIndex,
  type VideoAbrFormat,
} from '../../../shared/videoStreaming.js';
import type { VideoAttachmentQualityMeta, VideoQualityPreference } from '../../../shared/videoQuality.js';
import { API_BASE_URL } from '../../utils/api/shared.js';
import { CARD_DESC_VIDEO_STREAM_READY } from '../../utils/safeVideoPlay.js';

export interface CardDescriptionVideoAbrEngine {
  readonly usesAdaptiveStreaming: boolean;
  readonly attach: (video: HTMLVideoElement) => void;
  readonly detach: () => void;
  readonly applyQuality: (preference: VideoQualityPreference, meta: VideoAttachmentQualityMeta | null) => void;
}

function absoluteManifestUrl(relativeOrAbsolute: string): string {
  const trimmed = relativeOrAbsolute.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}${trimmed}`;
  }
  return `${API_BASE_URL.replace(/\/$/, '')}/${trimmed.replace(/^\//, '')}`;
}

function findHlsLevelForHeight(hls: Hls, targetHeight: number): number {
  const levels = hls.levels;
  let bestIndex = -1;
  let bestHeight = -1;
  for (let index = 0; index < levels.length; index += 1) {
    const height = levels[index]?.height ?? 0;
    if (height <= targetHeight && height > bestHeight) {
      bestHeight = height;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function findDashRepresentationIndex(player: dashjs.MediaPlayerClass, targetHeight: number): number {
  const reps = player.getRepresentationsByType('video') ?? [];
  let bestIndex = -1;
  let bestHeight = -1;
  for (let index = 0; index < reps.length; index += 1) {
    const height = reps[index]?.height ?? 0;
    if (height <= targetHeight && height > bestHeight) {
      bestHeight = height;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function setDashAutoQuality(player: dashjs.MediaPlayerClass, enabled: boolean): void {
  player.updateSettings({
    streaming: {
      abr: {
        autoSwitchBitrate: {
          video: enabled,
        },
      },
    },
  });
}

function notifyStreamReady(video: HTMLVideoElement): void {
  video.dispatchEvent(new Event(CARD_DESC_VIDEO_STREAM_READY));
}

function createEngine(format: VideoAbrFormat, manifestUrl: string): {
  attach(video: HTMLVideoElement): void;
  detach(): void;
  setQuality(preference: VideoQualityPreference, meta: VideoAttachmentQualityMeta | null): void;
} {
  const url = absoluteManifestUrl(manifestUrl);
  let hls: Hls | null = null;
  let dashPlayer: dashjs.MediaPlayerClass | null = null;
  let videoEl: HTMLVideoElement | null = null;

  let pendingQuality: VideoQualityPreference = 'auto';
  let pendingMeta: VideoAttachmentQualityMeta | null = null;

  const applyHlsQuality = (preference: VideoQualityPreference, meta: VideoAttachmentQualityMeta | null): void => {
    pendingQuality = preference;
    pendingMeta = meta;
    if (hls == null || meta == null) {
      return;
    }
    const levelIndex = resolveAbrLevelIndex({
      preference,
      sourceTier: meta.sourceTier,
      renditionHeights: meta.streaming.renditionHeights,
    });
    if (levelIndex < 0) {
      hls.currentLevel = -1;
      return;
    }
    const target = meta.streaming.renditionHeights[levelIndex];
    if (target == null) {
      hls.currentLevel = -1;
      return;
    }
    const mapped = findHlsLevelForHeight(hls, target);
    hls.currentLevel = mapped >= 0 ? mapped : -1;
  };

  const applyDashQuality = (preference: VideoQualityPreference, meta: VideoAttachmentQualityMeta | null): void => {
    pendingQuality = preference;
    pendingMeta = meta;
    if (dashPlayer == null || meta == null) {
      return;
    }
    const levelIndex = resolveAbrLevelIndex({
      preference,
      sourceTier: meta.sourceTier,
      renditionHeights: meta.streaming.renditionHeights,
    });
    if (levelIndex < 0) {
      setDashAutoQuality(dashPlayer, true);
      return;
    }
    const target = meta.streaming.renditionHeights[levelIndex];
    if (target == null) {
      setDashAutoQuality(dashPlayer, true);
      return;
    }
    const mapped = findDashRepresentationIndex(dashPlayer, target);
    if (mapped < 0) {
      setDashAutoQuality(dashPlayer, true);
      return;
    }
    setDashAutoQuality(dashPlayer, false);
    dashPlayer.setRepresentationForTypeByIndex('video', mapped);
  };

  const detachInternal = (): void => {
    if (hls != null) {
      hls.destroy();
      hls = null;
    }
    if (dashPlayer != null) {
      dashPlayer.destroy();
      dashPlayer = null;
    }
    if (videoEl != null) {
      videoEl.removeAttribute('src');
      videoEl.load();
      videoEl = null;
    }
  };

  return {
    attach(video: HTMLVideoElement): void {
      detachInternal();
      videoEl = video;
      if (format === 'hls') {
        // ponytail: iOS native HLS ignores manual level selection; upgrade with hls.js overrideNative if needed.
        if (video.canPlayType('application/vnd.apple.mpegurl') !== '') {
          video.src = url;
          notifyStreamReady(video);
          return;
        }
        if (!Hls.isSupported()) {
          video.src = url;
          notifyStreamReady(video);
          return;
        }
        hls = new Hls({ enableWorker: true });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          applyHlsQuality(pendingQuality, pendingMeta);
          notifyStreamReady(video);
        });
        hls.loadSource(url);
        hls.attachMedia(video);
        return;
      }

      dashPlayer = dashjs.MediaPlayer().create();
      dashPlayer.initialize(video, url, false);
      dashPlayer.on('streamInitialized' as dashjs.MediaPlayerEvents['STREAM_INITIALIZED'], () => {
        applyDashQuality(pendingQuality, pendingMeta);
        notifyStreamReady(video);
      });
    },
    detach(): void {
      detachInternal();
    },
    setQuality(preference: VideoQualityPreference, meta: VideoAttachmentQualityMeta | null): void {
      if (format === 'hls') {
        applyHlsQuality(preference, meta);
        return;
      }
      applyDashQuality(preference, meta);
    },
  };
}

export function useCardDescriptionVideoAbrEngine(args: {
  readonly qualityMeta: VideoAttachmentQualityMeta | null;
  readonly progressiveSrc: string;
  readonly enabled?: boolean;
}): CardDescriptionVideoAbrEngine {
  const engineRef = useRef<ReturnType<typeof createEngine> | null>(null);
  const progressiveVideoRef = useRef<HTMLVideoElement | null>(null);
  const enabled = args.enabled !== false;

  const streaming = args.qualityMeta?.streaming;
  const usesAdaptiveStreaming =
    enabled &&
    streaming?.ready === true &&
    ((streaming.hlsManifestUrl != null && streaming.hlsManifestUrl !== '') ||
      (streaming.dashManifestUrl != null && streaming.dashManifestUrl !== ''));

  useEffect(() => {
    engineRef.current?.detach();
    engineRef.current = null;
    if (!enabled || !usesAdaptiveStreaming || streaming == null) {
      return;
    }

    const format = pickVideoAbrFormatForUserAgent(
      typeof navigator !== 'undefined' ? navigator.userAgent : '',
    );
    const manifestUrl =
      format === 'hls'
        ? streaming.hlsManifestUrl ?? streaming.dashManifestUrl
        : streaming.dashManifestUrl ?? streaming.hlsManifestUrl;
    if (manifestUrl == null || manifestUrl.trim() === '') {
      return;
    }
    engineRef.current = createEngine(format, manifestUrl);
    return () => {
      engineRef.current?.detach();
      engineRef.current = null;
    };
  }, [enabled, streaming, usesAdaptiveStreaming]);

  const attach = useCallback((video: HTMLVideoElement): void => {
    if (engineRef.current != null) {
      engineRef.current.attach(video);
      return;
    }
    progressiveVideoRef.current = video;
    if (args.progressiveSrc.trim() !== '') {
      video.src = args.progressiveSrc;
      notifyStreamReady(video);
    }
  }, [args.progressiveSrc]);

  const detach = useCallback((): void => {
    if (engineRef.current != null) {
      engineRef.current.detach();
      return;
    }
    const video = progressiveVideoRef.current;
    if (video != null) {
      video.removeAttribute('src');
      video.load();
      progressiveVideoRef.current = null;
    }
  }, []);

  const applyQuality = useCallback(
    (preference: VideoQualityPreference, meta: VideoAttachmentQualityMeta | null): void => {
      engineRef.current?.setQuality(preference, meta);
    },
    [],
  );

  return {
    usesAdaptiveStreaming,
    attach,
    detach,
    applyQuality,
  };
}
