import { getEmojiSpriteSheetMeta } from './emojiSpriteLookup.js';

/** emoji-mart set payload with `sheet` grid matching the committed extended PNG. */
export interface EmojiMartTwitterSetData {
  readonly sheet: { readonly cols: number; readonly rows: number };
  readonly [key: string]: unknown;
}

/**
 * `@emoji-mart/data` twitter.json lists a 61×61 sheet; our committed PNG adds extension rows.
 * emoji-mart uses `sheet.rows` for background-size/position — it must match the PNG height.
 */
export function withExtendedEmojiSheet<T extends EmojiMartTwitterSetData>(data: T): T {
  return {
    ...data,
    sheet: getEmojiSpriteSheetMeta(),
  };
}
