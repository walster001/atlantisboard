/**
 * Same-origin Twitter emoji spritesheet (committed under `assets/emoji-datasource/`, synced to `public/` on build).
 * All in-app emoji rendering uses CSS background cells on this sheet — no per-file PNG tiles.
 */

/** emoji-mart + card descriptions + plain titles */
export const EMOJI_SPRITESHEET_PUBLIC_PATH =
  '/emoji-datasource/twitter/sheets-256/64.png';

/** @deprecated Use {@link EMOJI_SPRITESHEET_PUBLIC_PATH}. */
export const EMOJI_DATASOURCE_TWITTER_SPRITESHEET_64_PUBLIC_PATH =
  EMOJI_SPRITESHEET_PUBLIC_PATH;

const PNG_CODEPOINT_TAIL = /\/([0-9a-f-]+)\.png(?:\?.*)?$/i;

/** Extract Twemoji-style hyphenated codepoint from a legacy per-tile `src` URL. */
export function parseTwemojiCodepointFromSrc(src: unknown): string | null {
  if (typeof src !== 'string') {
    return null;
  }
  const s = src.trim();
  if (s === '') {
    return null;
  }
  const m = s.match(PNG_CODEPOINT_TAIL);
  if (m == null) {
    return null;
  }
  const looksTwemoji =
    s.includes('twemoji') || s.includes('72x72') || /^[0-9a-f-]+\.png$/i.test(s);
  if (!looksTwemoji) {
    return null;
  }
  return m[1]!.toLowerCase();
}
