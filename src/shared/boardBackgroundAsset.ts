import {
  CARD_TILE_IMAGE_PREVIEW,
  appendCardTileImagePreviewQuery,
  parseCardTileImagePreviewPreset,
} from './imagePreviewPreset.js';

/** Public API path for a stored board background object (MinIO). */
export const BOARD_BACKGROUND_API_PATH =
  /^\/api\/v1\/board-backgrounds\/([a-f0-9-]{36}\.(png|jpg|jpeg|webp|gif))$/i;

export const BOARD_BACKGROUND_CARD_PREVIEW = CARD_TILE_IMAGE_PREVIEW;

export function isBoardBackgroundAssetPath(pathname: string): boolean {
  const trimmed = pathname.trim();
  const pathOnly = (trimmed.split('?')[0] ?? trimmed).split('#')[0] ?? trimmed;
  const normalized = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
  return BOARD_BACKGROUND_API_PATH.test(normalized);
}

export function appendBoardBackgroundPreviewQuery(url: string): string {
  const trimmed = url.trim();
  if (trimmed === '' || !isBoardBackgroundAssetUrl(trimmed)) {
    return trimmed;
  }
  return appendCardTileImagePreviewQuery(trimmed);
}

export function isBoardBackgroundAssetUrl(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      return isBoardBackgroundAssetPath(new URL(trimmed).pathname);
    } catch {
      return false;
    }
  }
  return isBoardBackgroundAssetPath(trimmed);
}

export function parseBoardBackgroundPreviewPreset(
  previewRaw: string | undefined,
): { readonly maxWidth: number; readonly quality: number } | null {
  return parseCardTileImagePreviewPreset(previewRaw);
}
