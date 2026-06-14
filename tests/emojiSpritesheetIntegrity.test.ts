/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { existsSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import twitterData from '@emoji-mart/data/sets/15/twitter.json';
import manifest from '../src/shared/twemoji/emojiSpriteManifest.json';
import { withExtendedEmojiSheet } from '../src/shared/twemoji/emojiMartTwitterData.js';
import { getEmojiSpriteSheetMeta } from '../src/shared/twemoji/emojiSpriteLookup.js';

const projectRoot = join(import.meta.dir, '..');
const assetSheetPath = join(
  projectRoot,
  'assets/emoji-datasource/twitter/sheets-256/64.png',
);

describe('emoji spritesheet integrity', () => {
  it('commits the extended PNG under assets/', () => {
    expect(existsSync(assetSheetPath)).toBe(true);
  });

  it('matches manifest grid dimensions', async () => {
    const meta = await sharp(assetSheetPath).metadata();
    expect(meta.width).toBe(manifest.sheet.cols * manifest.cellStridePx);
    expect(meta.height).toBe(manifest.sheet.rows * manifest.cellStridePx);
  });

  it('extends emoji-mart twitter set sheet rows beyond the base 61×61 grid', () => {
    expect(twitterData.sheet.rows).toBe(61);
    expect(withExtendedEmojiSheet(twitterData).sheet).toEqual(getEmojiSpriteSheetMeta());
    expect(getEmojiSpriteSheetMeta().rows).toBeGreaterThan(twitterData.sheet.rows);
  });
});
