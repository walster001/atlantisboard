/** Shared ?preview=card preset for list/tile cover images (board backgrounds, card covers). */
export const CARD_TILE_IMAGE_PREVIEW = {
  queryKey: 'preview',
  queryValue: 'card',
  maxWidth: 520,
  quality: 72,
} as const;

export interface ImagePreviewPreset {
  readonly maxWidth: number;
  readonly quality: number;
}

export function parseCardTileImagePreviewPreset(
  previewRaw: string | undefined,
): ImagePreviewPreset | null {
  if (previewRaw !== CARD_TILE_IMAGE_PREVIEW.queryValue) {
    return null;
  }
  return {
    maxWidth: CARD_TILE_IMAGE_PREVIEW.maxWidth,
    quality: CARD_TILE_IMAGE_PREVIEW.quality,
  };
}

export function appendCardTileImagePreviewQuery(url: string): string {
  const trimmed = url.trim();
  if (trimmed === '') {
    return trimmed;
  }
  const { queryKey, queryValue } = CARD_TILE_IMAGE_PREVIEW;
  if (new RegExp(`[?&]${queryKey}=`).test(trimmed)) {
    return trimmed;
  }
  const hashIndex = trimmed.indexOf('#');
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  const separator = withoutHash.includes('?') ? '&' : '?';
  return `${withoutHash}${separator}${queryKey}=${queryValue}${hash}`;
}
