import { parseCardTileImagePreviewPreset } from './imagePreviewPreset.js';
import { parseVideoPosterPreviewPreset } from './videoPosterPreviewPreset.js';

export function parseAttachmentPreviewQuery(
  previewRaw: string | undefined,
): { readonly kind: 'card_image'; readonly maxWidth: number; readonly quality: number }
  | { readonly kind: 'video_poster'; readonly maxWidth: number; readonly quality: number }
  | null {
  const card = parseCardTileImagePreviewPreset(previewRaw);
  if (card != null) {
    return { kind: 'card_image', ...card };
  }
  const poster = parseVideoPosterPreviewPreset(previewRaw);
  if (poster != null) {
    return { kind: 'video_poster', ...poster };
  }
  return null;
}

export function hasAttachmentPreviewQuery(previewRaw: string | undefined): boolean {
  return parseAttachmentPreviewQuery(previewRaw) != null;
}
