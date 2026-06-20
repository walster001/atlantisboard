/** Ignore play() AbortError when a new load interrupts playback (common during source attach). */
export function safeVideoPlay(video: HTMLVideoElement | null | undefined): void {
  if (video == null) {
    return;
  }
  const result = video.play();
  if (result != null) {
    void result.catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
    });
  }
}
