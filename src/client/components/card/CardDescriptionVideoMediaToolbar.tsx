import { ActionIcon, Group, Slider, Text } from '@mantine/core';
import {
  IconMaximize,
  IconMinimize,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconVolume,
  IconVolume2,
  IconVolume3,
} from '@tabler/icons-react';
import {
  useCallback,
  useEffect,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { safeVideoPlay } from '../../utils/safeVideoPlay.js';
import {
  exitVideoNativeFullscreen,
  isVideoNativeFullscreenActive,
  requestVideoNativeFullscreen,
} from '../../utils/videoNativeFullscreen.js';
import { useResponsiveTier } from '../../hooks/useResponsiveTier.js';
import type { VideoAttachmentQualityMeta, VideoQualityPreference } from '../../../shared/videoQuality.js';
import { CardDescriptionVideoQualityControl } from './CardDescriptionVideoQualityControl.js';

export interface CardDescriptionVideoMediaToolbarProps {
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly shellRef: RefObject<HTMLDivElement | null>;
  readonly mediaKey: string;
  readonly quality: VideoQualityPreference;
  readonly qualityMeta: VideoAttachmentQualityMeta | null;
  readonly onQualityChange: (next: VideoQualityPreference) => void;
  readonly onDescriptionClickCapture?: (event: MouseEvent | PointerEvent) => void;
}

interface VideoMediaState {
  readonly isPlaying: boolean;
  readonly currentTime: number;
  readonly duration: number;
  readonly volumePercent: number;
  readonly isMuted: boolean;
}

function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function readVideoMediaState(video: HTMLVideoElement): VideoMediaState {
  return {
    isPlaying: !video.paused && !video.ended,
    currentTime: video.currentTime,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    volumePercent: Math.round(video.volume * 100),
    isMuted: video.muted || video.volume === 0,
  };
}

function useCardDescriptionVideoMediaState(
  videoRef: RefObject<HTMLVideoElement | null>,
  mediaKey: string,
): VideoMediaState {
  const [state, setState] = useState<VideoMediaState>(() => {
    const video = videoRef.current;
    return video != null
      ? readVideoMediaState(video)
      : {
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          volumePercent: 100,
          isMuted: false,
        };
  });

  useEffect(() => {
    const video = videoRef.current;
    if (video == null) {
      return;
    }

    const sync = (): void => {
      setState(readVideoMediaState(video));
    };

    sync();
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    video.addEventListener('ended', sync);
    video.addEventListener('timeupdate', sync);
    video.addEventListener('loadedmetadata', sync);
    video.addEventListener('durationchange', sync);
    video.addEventListener('volumechange', sync);

    return () => {
      video.removeEventListener('play', sync);
      video.removeEventListener('pause', sync);
      video.removeEventListener('ended', sync);
      video.removeEventListener('timeupdate', sync);
      video.removeEventListener('loadedmetadata', sync);
      video.removeEventListener('durationchange', sync);
      video.removeEventListener('volumechange', sync);
    };
  }, [mediaKey, videoRef]);

  return state;
}

const TOOLBAR_IDLE_MS = 3000;

export function CardDescriptionVideoMediaToolbar({
  videoRef,
  shellRef,
  mediaKey,
  quality,
  qualityMeta,
  onQualityChange,
  onDescriptionClickCapture,
}: CardDescriptionVideoMediaToolbarProps) {
  const { isPlaying, currentTime, duration, volumePercent, isMuted } =
    useCardDescriptionVideoMediaState(videoRef, mediaKey);
  const isMobile = useResponsiveTier() === 'mobile';
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [toolbarPeek, setToolbarPeek] = useState(false);

  useEffect(() => {
    const shell = shellRef.current;
    if (shell == null || !isPlaying) {
      setToolbarPeek(false);
      return;
    }

    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const bumpPeek = (): void => {
      setToolbarPeek(true);
      if (hideTimer != null) {
        clearTimeout(hideTimer);
      }
      hideTimer = setTimeout(() => {
        if (!qualityMenuOpen) {
          setToolbarPeek(false);
        }
      }, TOOLBAR_IDLE_MS);
    };

    bumpPeek();
    shell.addEventListener('pointermove', bumpPeek);
    shell.addEventListener('keydown', bumpPeek);

    return () => {
      shell.removeEventListener('pointermove', bumpPeek);
      shell.removeEventListener('keydown', bumpPeek);
      if (hideTimer != null) {
        clearTimeout(hideTimer);
      }
    };
  }, [isPlaying, qualityMenuOpen, shellRef]);

  useEffect(() => {
    if (qualityMenuOpen) {
      setToolbarPeek(true);
    }
  }, [qualityMenuOpen]);

  useEffect(() => {
    const shell = shellRef.current;
    if (shell == null) {
      return;
    }
    shell.classList.toggle('card-desc-video-player-shell--toolbar-peek', toolbarPeek);
    shell.classList.toggle('card-desc-video-player-shell--quality-menu-open', qualityMenuOpen);
    return () => {
      shell.classList.remove('card-desc-video-player-shell--toolbar-peek');
      shell.classList.remove('card-desc-video-player-shell--quality-menu-open');
    };
  }, [qualityMenuOpen, shellRef, toolbarPeek]);

  useEffect(() => {
    const sync = (): void => {
      const shell = shellRef.current;
      const video = videoRef.current;
      if (isMobile) {
        setIsFullscreen(video != null && isVideoNativeFullscreenActive(video));
        return;
      }
      const fullscreenElement = document.fullscreenElement;
      const inPlayerFullscreen =
        shell != null &&
        (fullscreenElement === shell || fullscreenElement === video);
      setIsFullscreen(inPlayerFullscreen);
    };
    sync();
    document.addEventListener('fullscreenchange', sync);
    const video = videoRef.current;
    video?.addEventListener('webkitbeginfullscreen', sync);
    video?.addEventListener('webkitendfullscreen', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      video?.removeEventListener('webkitbeginfullscreen', sync);
      video?.removeEventListener('webkitendfullscreen', sync);
    };
  }, [isMobile, mediaKey, shellRef, videoRef]);

  const iconStyle = {
    width: 'var(--card-desc-video-icon-size, 18px)',
    height: 'var(--card-desc-video-icon-size, 18px)',
  } as const;

  const videoSliderStyles = {
    bar: { backgroundColor: '#fff' },
    thumb: {
      backgroundColor: '#fff',
      borderColor: '#fff',
      width: 12,
      height: 12,
    },
    track: { backgroundColor: 'rgba(255, 255, 255, 0.28)' },
  } as const;

  const handlePlayToggle = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      onDescriptionClickCapture?.(event);
      event.stopPropagation();
      const video = videoRef.current;
      if (video == null) {
        return;
      }
      if (video.paused) {
        safeVideoPlay(video);
      } else {
        video.pause();
      }
    },
    [onDescriptionClickCapture, videoRef],
  );

  const handleSeek = useCallback(
    (next: number) => {
      const video = videoRef.current;
      if (video == null || !Number.isFinite(duration) || duration <= 0) {
        return;
      }
      video.currentTime = (next / 100) * duration;
    },
    [duration, videoRef],
  );

  const handleVolumeChange = useCallback(
    (next: number) => {
      const video = videoRef.current;
      if (video == null) {
        return;
      }
      const normalized = Math.max(0, Math.min(100, next)) / 100;
      video.volume = normalized;
      if (normalized > 0 && video.muted) {
        video.muted = false;
      }
    },
    [videoRef],
  );

  const handleMuteToggle = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      onDescriptionClickCapture?.(event);
      event.stopPropagation();
      const video = videoRef.current;
      if (video == null) {
        return;
      }
      video.muted = !video.muted;
    },
    [onDescriptionClickCapture, videoRef],
  );

  const handleFullscreenToggle = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      onDescriptionClickCapture?.(event);
      event.stopPropagation();
      if (isMobile) {
        const video = videoRef.current;
        if (video == null) {
          return;
        }
        if (isVideoNativeFullscreenActive(video)) {
          exitVideoNativeFullscreen(video);
        } else {
          requestVideoNativeFullscreen(video);
        }
        return;
      }
      const target = shellRef.current ?? videoRef.current;
      if (target == null) {
        return;
      }
      if (document.fullscreenElement != null) {
        void document.exitFullscreen();
        return;
      }
      void target.requestFullscreen();
    },
    [isMobile, onDescriptionClickCapture, shellRef, videoRef],
  );

  const seekPercent =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const volumeIcon =
    isMuted || volumePercent === 0 ? (
      <IconVolume3 stroke={1.75} style={iconStyle} />
    ) : volumePercent < 50 ? (
      <IconVolume2 stroke={1.75} style={iconStyle} />
    ) : (
      <IconVolume stroke={1.75} style={iconStyle} />
    );

  return (
    <div className="card-desc-video-media-toolbar">
      <Group className="card-desc-video-media-toolbar__row" gap="xs" wrap="nowrap">
        <ActionIcon
          className="card-desc-video-media-toolbar__button"
          variant="subtle"
          color="gray"
          radius="sm"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          onClick={handlePlayToggle}
        >
          {isPlaying ? (
            <IconPlayerPauseFilled stroke={1.75} style={iconStyle} />
          ) : (
            <IconPlayerPlayFilled stroke={1.75} style={iconStyle} />
          )}
        </ActionIcon>
        <Slider
          className="card-desc-video-media-toolbar__seek"
          value={seekPercent}
          onChange={handleSeek}
          min={0}
          max={100}
          step={0.1}
          size="xs"
          aria-label="Seek"
          label={null}
          styles={videoSliderStyles}
        />
        <Text className="card-desc-video-media-toolbar__time" aria-live="off">
          {formatVideoTime(currentTime)} / {formatVideoTime(duration)}
        </Text>
        <Group
          className="card-desc-video-media-toolbar__secondary"
          gap="xs"
          wrap="nowrap"
          ml="auto"
        >
          <ActionIcon
            className="card-desc-video-media-toolbar__button"
            variant="subtle"
            color="gray"
            radius="sm"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
            onClick={handleMuteToggle}
          >
            {volumeIcon}
          </ActionIcon>
          <Slider
            className="card-desc-video-media-toolbar__volume"
            value={isMuted ? 0 : volumePercent}
            onChange={handleVolumeChange}
            min={0}
            max={100}
            step={1}
            size="xs"
            aria-label="Volume"
            label={(value) => `${value}%`}
            showLabelOnHover
            styles={videoSliderStyles}
          />
          <CardDescriptionVideoQualityControl
            quality={quality}
            qualityMeta={qualityMeta}
            onQualityChange={onQualityChange}
            isFullscreen={isFullscreen}
            onMenuOpenChange={setQualityMenuOpen}
            {...(onDescriptionClickCapture != null
              ? { onDescriptionClickCapture }
              : {})}
          />
          <ActionIcon
            className="card-desc-video-media-toolbar__button"
            variant="subtle"
            color="gray"
            radius="sm"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            onClick={handleFullscreenToggle}
          >
            {isFullscreen ? (
              <IconMinimize stroke={1.75} style={iconStyle} />
            ) : (
              <IconMaximize stroke={1.75} style={iconStyle} />
            )}
          </ActionIcon>
        </Group>
      </Group>
    </div>
  );
}
