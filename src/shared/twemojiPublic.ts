/**
 * Same-origin Twemoji 72×72 PNGs under `/twemoji/72x72/` (see `scripts/sync-twemoji-assets.ts`).
 * Avoids third-party CDNs and browser tracking-prevention issues with cross-site emoji assets.
 */

export const TWEMOJI_PNG_PUBLIC_PREFIX = '/twemoji/72x72/';

/**
 * emoji-mart hardcodes spritesheet mode; this path mirrors the jsDelivr layout but is served from
 * `public/` (copied from `emoji-datasource-twitter` by `scripts/sync-twemoji-assets.ts`).
 */
export const EMOJI_DATASOURCE_TWITTER_SPRITESHEET_64_PUBLIC_PATH =
  '/emoji-datasource/twitter/sheets-256/64.png';

/** Options for `twemoji.parse()` — resolves to `/twemoji/72x72/<codepoint>.png`. */
export const TWEMOJI_PARSE_OPTIONS = {
  base: '/twemoji/',
  folder: '72x72',
  ext: '.png',
  className: 'card-desc-twemoji',
} as const;

const PNG_CODEPOINT_TAIL = /\/([0-9a-f-]+)\.png(?:\?.*)?$/i;

/**
 * Rewrites known Twemoji CDN (or legacy) image URLs to the local public path so stored card JSON
 * keeps working after switching off jsDelivr/maxcdn.
 */
export function rewriteTwemojiSrcToPublic(src: unknown): string {
  if (typeof src !== 'string') {
    return '';
  }
  const s = src.trim();
  if (s === '') {
    return '';
  }
  if (s.startsWith(TWEMOJI_PNG_PUBLIC_PREFIX)) {
    return s;
  }
  const m = s.match(PNG_CODEPOINT_TAIL);
  if (m == null) {
    return s;
  }
  const looksTwemoji =
    s.includes('twemoji') ||
    s.includes('72x72') ||
    /^[0-9a-f-]+\.png$/i.test(s);
  if (!looksTwemoji) {
    return s;
  }
  return `${TWEMOJI_PNG_PUBLIC_PREFIX}${m[1]}.png`;
}
