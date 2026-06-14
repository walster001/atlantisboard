/** Shared ?preview=poster preset for video thumbnails and import placeholders. */
export const VIDEO_POSTER_PREVIEW = {
  queryKey: 'preview',
  queryValue: 'poster',
  /** Used for import-placeholder WebP only; video posters keep native video dimensions via ffmpeg. */
  maxWidth: 320,
  quality: 68,
} as const;

export interface VideoPosterPreviewPreset {
  readonly maxWidth: number;
  readonly quality: number;
}

export function parseVideoPosterPreviewPreset(
  previewRaw: string | undefined,
): VideoPosterPreviewPreset | null {
  if (previewRaw !== VIDEO_POSTER_PREVIEW.queryValue) {
    return null;
  }
  return {
    maxWidth: VIDEO_POSTER_PREVIEW.maxWidth,
    quality: VIDEO_POSTER_PREVIEW.quality,
  };
}

export function appendVideoPosterPreviewQuery(url: string): string {
  const trimmed = url.trim();
  if (trimmed === '') {
    return trimmed;
  }
  const { queryKey, queryValue } = VIDEO_POSTER_PREVIEW;
  if (new RegExp(`[?&]${queryKey}=`).test(trimmed)) {
    return trimmed;
  }
  const hashIndex = trimmed.indexOf('#');
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  const separator = withoutHash.includes('?') ? '&' : '?';
  return `${withoutHash}${separator}${queryKey}=${queryValue}${hash}`;
}
