type VideoWithWebkitFullscreen = HTMLVideoElement & {
  readonly webkitEnterFullscreen?: () => void;
  readonly webkitExitFullscreen?: () => void;
  readonly webkitDisplayingFullscreen?: boolean;
};

function asWebkitVideo(video: HTMLVideoElement): VideoWithWebkitFullscreen {
  return video;
}

/** iOS Safari native video fullscreen (custom toolbar cannot use shell `requestFullscreen`). */
export function isVideoNativeFullscreenActive(video: HTMLVideoElement): boolean {
  const webkitVideo = asWebkitVideo(video);
  if (webkitVideo.webkitDisplayingFullscreen === true) {
    return true;
  }
  return document.fullscreenElement === video;
}

export function requestVideoNativeFullscreen(video: HTMLVideoElement): void {
  const webkitVideo = asWebkitVideo(video);
  if (typeof webkitVideo.webkitEnterFullscreen === 'function') {
    webkitVideo.webkitEnterFullscreen();
    return;
  }
  void video.requestFullscreen();
}

export function exitVideoNativeFullscreen(video: HTMLVideoElement): void {
  const webkitVideo = asWebkitVideo(video);
  if (webkitVideo.webkitDisplayingFullscreen === true && typeof webkitVideo.webkitExitFullscreen === 'function') {
    webkitVideo.webkitExitFullscreen();
    return;
  }
  if (document.fullscreenElement === video) {
    void document.exitFullscreen();
  }
}
