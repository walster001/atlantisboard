import { useAudioContext } from '@gfazioli/mantine-audio';
import { useCallback, useEffect, useMemo, useReducer } from 'react';
import {
  applyCardDescriptionAudioGainVolume,
  isMediaElementVolumeProgrammable,
  readCardDescriptionAudioGainVolumePercent,
  releaseCardDescriptionAudioGainRoute,
} from './cardDescriptionAudioVolumeControl.js';

export interface CardDescriptionPodcastVolume {
  readonly volumePercent: number;
  readonly setVolumePercent: (percent: number) => void;
  readonly isMuted: boolean;
  readonly usesGainVolume: boolean;
}

function resolveGainVolumePercent(element: HTMLAudioElement | null): number {
  if (element == null) {
    return 100;
  }
  return readCardDescriptionAudioGainVolumePercent(element) ?? 100;
}

export function useCardDescriptionPodcastVolume(): CardDescriptionPodcastVolume {
  const ctx = useAudioContext();
  const usesGainVolume = useMemo(() => !isMediaElementVolumeProgrammable(), []);
  const [, bumpGainDisplay] = useReducer((tick: number) => tick + 1, 0);

  useEffect(() => {
    if (!usesGainVolume) {
      return undefined;
    }
    return () => {
      const element = ctx.audioRef.current;
      if (element != null) {
        releaseCardDescriptionAudioGainRoute(element);
      }
    };
  }, [ctx, usesGainVolume]);

  const setVolumePercent = useCallback(
    (percent: number) => {
      const normalized = Math.max(0, Math.min(100, percent)) / 100;
      if (usesGainVolume) {
        const element = ctx.audioRef.current;
        if (element == null) {
          return;
        }
        if (applyCardDescriptionAudioGainVolume(element, normalized)) {
          bumpGainDisplay();
        }
        return;
      }
      ctx.setVolume(normalized);
    },
    [ctx, usesGainVolume],
  );

  const volumePercent = ctx.muted
    ? 0
    : usesGainVolume
      ? resolveGainVolumePercent(ctx.audioRef.current)
      : Math.round(ctx.volume * 100);

  return {
    volumePercent,
    setVolumePercent,
    isMuted: ctx.muted || volumePercent === 0,
    usesGainVolume,
  };
}
