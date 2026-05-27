/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  getEmojiSpriteCell,
  getEmojiSpriteCellForCodepoint,
  getEmojiSpriteSheetMeta,
} from '../src/shared/twemoji/emojiSpriteLookup.js';

describe('emojiSpriteLookup', () => {
  it('resolves picker natives on the base grid', () => {
    const cell = getEmojiSpriteCell('😉');
    expect(cell).toBeDefined();
    expect(cell!.y).toBeLessThan(61);
  });

  it('resolves extension codepoints appended below the base sheet', () => {
    const cell = getEmojiSpriteCellForCodepoint('1f3fb');
    expect(cell).toEqual({ x: 0, y: 61 });
  });

  it('reports extended sheet dimensions from the manifest', () => {
    expect(getEmojiSpriteSheetMeta()).toEqual({ cols: 61, rows: 66 });
  });
});
