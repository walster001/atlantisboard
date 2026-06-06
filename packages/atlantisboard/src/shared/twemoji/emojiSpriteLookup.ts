/**
 * Spritesheet grid lookup for Twitter emoji (emoji-datasource + extension rows).
 * `@emoji-mart/data` twitter.json covers picker natives; `emojiSpriteManifest.json` adds
 * extra codepoints from individual 64px tiles not listed in the mart set.
 */

import twemoji from 'twemoji';
import twitterData from '@emoji-mart/data/sets/15/twitter.json';
import manifest from './emojiSpriteManifest.json';

export interface EmojiSpriteCell {
  readonly x: number;
  readonly y: number;
}

interface EmojiSpriteManifest {
  readonly version: string;
  readonly sheet: { readonly cols: number; readonly rows: number };
  readonly cellStridePx: number;
  readonly codepoint: Readonly<Record<string, readonly [number, number]>>;
}

const sheetManifest = manifest as unknown as EmojiSpriteManifest;

const nativeToGrid = new Map<string, EmojiSpriteCell>();
const codepointToGrid = new Map<string, EmojiSpriteCell>();

for (const id of Object.keys(twitterData.emojis)) {
  const entry = twitterData.emojis[id];
  if (entry?.skins == null) {
    continue;
  }
  for (const skin of entry.skins) {
    nativeToGrid.set(skin.native, { x: skin.x, y: skin.y });
    if (typeof skin.unified === 'string' && skin.unified.trim() !== '') {
      codepointToGrid.set(skin.unified.toLowerCase(), { x: skin.x, y: skin.y });
    }
  }
}

for (const [cp, pair] of Object.entries(sheetManifest.codepoint)) {
  const cell = { x: pair[0], y: pair[1] };
  codepointToGrid.set(cp.toLowerCase(), cell);
}

export function getEmojiSpriteSheetMeta(): {
  readonly cols: number;
  readonly rows: number;
} {
  return sheetManifest.sheet;
}

export function getEmojiSpriteCellForCodepoint(
  codepoint: string,
): EmojiSpriteCell | undefined {
  const key = codepoint.trim().toLowerCase();
  if (key === '') {
    return undefined;
  }
  return codepointToGrid.get(key);
}

/** Resolve a Unicode emoji grapheme to a spritesheet cell (native or codepoint). */
export function getEmojiSpriteCell(nativeEmoji: string): EmojiSpriteCell | undefined {
  const trimmed = nativeEmoji.trim();
  if (trimmed === '') {
    return undefined;
  }
  const byNative = nativeToGrid.get(trimmed);
  if (byNative != null) {
    return byNative;
  }
  const cp = twemoji.convert.toCodePoint(trimmed).toLowerCase();
  return codepointToGrid.get(cp);
}

/** @deprecated Use {@link getEmojiSpriteSheetMeta}. */
export const getTwitterEmojiSheetMeta = getEmojiSpriteSheetMeta;

/** @deprecated Use {@link getEmojiSpriteCell}. */
export const getTwitterEmojiSpriteCell = getEmojiSpriteCell;
