/**
 * Maps Unicode emoji strings to emoji-datasource Twitter spritesheet grid cells.
 * Data must stay aligned with `EMOJI_DATASOURCE_TWITTER_SPRITESHEET_64_PUBLIC_PATH` (v15 sheet).
 */

import twitterData from '@emoji-mart/data/sets/15/twitter.json';

interface TwitterSkin {
  readonly unified: string;
  readonly native: string;
  readonly x: number;
  readonly y: number;
}

interface TwitterEmojiEntry {
  readonly skins: readonly TwitterSkin[];
}

interface TwitterSetJson {
  readonly sheet: { readonly cols: number; readonly rows: number };
  readonly emojis: Readonly<Record<string, TwitterEmojiEntry>>;
}

const data = twitterData as TwitterSetJson;

const nativeToGrid = new Map<string, { readonly x: number; readonly y: number }>();
for (const id of Object.keys(data.emojis)) {
  const entry = data.emojis[id];
  if (entry?.skins == null) {
    continue;
  }
  for (const skin of entry.skins) {
    nativeToGrid.set(skin.native, { x: skin.x, y: skin.y });
  }
}

export function getTwitterEmojiSheetMeta(): { readonly cols: number; readonly rows: number } {
  return data.sheet;
}

export function getTwitterEmojiSpriteCell(
  nativeEmoji: string,
): { readonly x: number; readonly y: number } | undefined {
  return nativeToGrid.get(nativeEmoji);
}
