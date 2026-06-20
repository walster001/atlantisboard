export const CARD_DESC_VIDEO_STREAM_READY = 'card-desc-video-stream-ready';

function isBenignPlayError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'AbortError' || error.name === 'NotAllowedError');
}

/** Ignore play() AbortError when a new load interrupts playback (common during source attach). */
export function safeVideoPlay(video: HTMLVideoElement | null | undefined): void {
  if (video == null) {
    return;
  }
  const result = video.play();
  if (result != null) {
    void result.catch((error: unknown) => {
      if (isBenignPlayError(error)) {
        return;
      }
    });
  }
}

/**
 * User-gesture play with retries while adaptive/progressive sources attach and buffer.
 * Returns a disposer for stream-ready / canplay listeners.
 */
export function requestVideoPlayWhenReady(
  video: HTMLVideoElement,
  onPlaying?: () => void,
): () => void {
  let disposed = false;

  const markPlaying = (): void => {
    if (disposed || video.paused) {
      return;
    }
    onPlaying?.();
  };

  const attemptPlay = (): void => {
    if (disposed) {
      return;
    }
    const result = video.play();
    if (result == null) {
      markPlaying();
      return;
    }
    void result
      .then(() => {
        markPlaying();
      })
      .catch((error: unknown) => {
        if (isBenignPlayError(error)) {
          return;
        }
      });
  };

  const onMediaReady = (): void => {
    if (disposed || !video.paused) {
      return;
    }
    attemptPlay();
  };

  video.addEventListener(CARD_DESC_VIDEO_STREAM_READY, onMediaReady);
  video.addEventListener('canplay', onMediaReady);
  video.addEventListener('loadeddata', onMediaReady);

  attemptPlay();

  return () => {
    disposed = true;
    video.removeEventListener(CARD_DESC_VIDEO_STREAM_READY, onMediaReady);
    video.removeEventListener('canplay', onMediaReady);
    video.removeEventListener('loadeddata', onMediaReady);
  };
}
