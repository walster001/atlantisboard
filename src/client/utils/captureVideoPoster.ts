/**
 * Capture a JPEG poster frame from a local video file or object URL (upload flow).
 */
export async function captureVideoPosterBlobFromObjectUrl(objectUrl: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'auto';

    const cleanup = (): void => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };

    const fail = (message: string): void => {
      cleanup();
      reject(new Error(message));
    };

    video.addEventListener(
      'error',
      () => {
        fail('Video load failed while capturing poster');
      },
      { once: true },
    );

    video.addEventListener(
      'loadeddata',
      () => {
        const duration = video.duration;
        const seekTo =
          Number.isFinite(duration) && duration > 0
            ? Math.min(0.25, duration * 0.02)
            : 0.1;
        video.currentTime = seekTo;
      },
      { once: true },
    );

    video.addEventListener(
      'seeked',
      () => {
        try {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (w < 1 || h < 1) {
            fail('Video has no frame dimensions');
            return;
          }
          const maxDim = 1280;
          const scale = Math.min(1, maxDim / Math.max(w, h));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          const ctx = canvas.getContext('2d');
          if (ctx == null) {
            fail('Canvas is unavailable');
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              cleanup();
              if (blob != null) {
                resolve(blob);
              } else {
                fail('Poster JPEG encode failed');
              }
            },
            'image/jpeg',
            0.85,
          );
        } catch {
          fail('Poster capture failed');
        }
      },
      { once: true },
    );

    video.src = objectUrl;
  });
}

export async function captureVideoPosterBlobFromFile(file: File): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await captureVideoPosterBlobFromObjectUrl(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Capture a poster from a remote or same-origin video URL (description playback URL).
 */
export async function captureVideoPosterBlobFromMediaUrl(
  mediaUrl: string,
  options?: { readonly useCredentials?: boolean },
): Promise<Blob> {
  const trimmed = mediaUrl.trim();
  if (trimmed === '') {
    throw new Error('Empty video URL');
  }

  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return captureVideoPosterBlobFromObjectUrl(trimmed);
  }

  const absolute =
    trimmed.startsWith('/') && typeof window !== 'undefined'
      ? `${window.location.origin}${trimmed}`
      : trimmed;

  if (options?.useCredentials === true) {
    // Same-origin attachment URLs: load via <video> so the browser can range-read metadata
    // and a single frame — never download the entire file into memory.
    return captureVideoPosterBlobFromObjectUrl(absolute);
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'auto';

    const cleanup = (): void => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };

    const fail = (message: string): void => {
      cleanup();
      reject(new Error(message));
    };

    video.addEventListener('error', () => fail('Remote video load failed'), { once: true });
    video.addEventListener(
      'loadeddata',
      () => {
        const duration = video.duration;
        const seekTo =
          Number.isFinite(duration) && duration > 0
            ? Math.min(0.25, duration * 0.02)
            : 0.1;
        video.currentTime = seekTo;
      },
      { once: true },
    );
    video.addEventListener(
      'seeked',
      () => {
        try {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (w < 1 || h < 1) {
            fail('Video has no frame dimensions');
            return;
          }
          const maxDim = 1280;
          const scale = Math.min(1, maxDim / Math.max(w, h));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          const ctx = canvas.getContext('2d');
          if (ctx == null) {
            fail('Canvas is unavailable');
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              cleanup();
              if (blob != null) {
                resolve(blob);
              } else {
                fail('Poster JPEG encode failed');
              }
            },
            'image/jpeg',
            0.85,
          );
        } catch {
          fail('Poster capture failed');
        }
      },
      { once: true },
    );

    video.src = absolute;
  });
}
