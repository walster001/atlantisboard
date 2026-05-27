#!/usr/bin/env bun
/**
 * Builds the committed Twitter emoji spritesheet used by the app (picker, titles, card bodies).
 *
 * 1. Keeps the emoji-datasource `sheets-256/64.png` grid (61×61, 66px stride) unchanged.
 * 2. Appends tiles from `img/twitter/64/*.png` that are not listed in `@emoji-mart/data` twitter.json.
 * 3. Writes `public/emoji-datasource/twitter/sheets-256/64.png` and
 *    `src/shared/twemoji/emojiSpriteManifest.json` (extension codepoint → x,y only).
 *
 * Run after upgrading `emoji-datasource-twitter` or `@emoji-mart/data`:
 *   bun run build:emoji-sheet
 */

import { createHash } from 'crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import twitterData from '@emoji-mart/data/sets/15/twitter.json';

const EMOJI_DATASOURCE_VERSION = '15.0.1';
const MANIFEST_VERSION = `${EMOJI_DATASOURCE_VERSION}-ext1`;

const BASE_COLS = twitterData.sheet.cols;
const BASE_ROWS = twitterData.sheet.rows;

const projectRoot = join(import.meta.dir, '..');
const datasourceRoot = join(projectRoot, 'node_modules/emoji-datasource-twitter');
const baseSheetPath = join(datasourceRoot, 'img/twitter/sheets-256/64.png');
const tilesDir = join(datasourceRoot, 'img/twitter/64');
const publicSheetPath = join(
  projectRoot,
  'public/emoji-datasource/twitter/sheets-256/64.png',
);
const manifestPath = join(projectRoot, 'src/shared/twemoji/emojiSpriteManifest.json');

function unifiedOnTwitterSheet(): ReadonlySet<string> {
  const onSheet = new Set<string>();
  for (const id of Object.keys(twitterData.emojis)) {
    const entry = twitterData.emojis[id];
    if (entry?.skins == null) {
      continue;
    }
    for (const skin of entry.skins) {
      if (typeof skin.unified === 'string' && skin.unified.trim() !== '') {
        onSheet.add(skin.unified.toLowerCase());
      }
    }
  }
  return onSheet;
}

function listExtensionTiles(onSheet: ReadonlySet<string>): readonly string[] {
  const files = readdirSync(tilesDir)
    .filter((f) => f.endsWith('.png'))
    .map((f) => f.slice(0, -4).toLowerCase())
    .filter((codepoint) => !onSheet.has(codepoint))
    .sort();
  return files;
}

async function main(): Promise<void> {
  const onSheet = unifiedOnTwitterSheet();
  const extensions = listExtensionTiles(onSheet);

  const baseMeta = await sharp(baseSheetPath).metadata();
  if (baseMeta.width == null || baseMeta.height == null) {
    throw new Error(`Could not read base sheet dimensions: ${baseSheetPath}`);
  }
  if (baseMeta.width !== baseMeta.height) {
    throw new Error(`Expected square sheet, got ${baseMeta.width}×${baseMeta.height}`);
  }

  const cellStridePx = Math.round(baseMeta.width / BASE_COLS);
  if (cellStridePx * BASE_COLS !== baseMeta.width) {
    throw new Error(
      `Sheet width ${baseMeta.width} is not divisible by ${BASE_COLS} columns`,
    );
  }

  const extensionRows = extensions.length === 0 ? 0 : Math.ceil(extensions.length / BASE_COLS);
  const totalRows = BASE_ROWS + extensionRows;
  const outHeight = totalRows * cellStridePx;
  const outWidth = baseMeta.width;

  const composites: sharp.OverlayOptions[] = [];

  for (let i = 0; i < extensions.length; i += 1) {
    const codepoint = extensions[i]!;
    const col = i % BASE_COLS;
    const row = BASE_ROWS + Math.floor(i / BASE_COLS);
    const tilePath = join(tilesDir, `${codepoint}.png`);
    const tile = sharp(tilePath).resize(cellStridePx, cellStridePx, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
    composites.push({
      input: await tile.png().toBuffer(),
      left: col * cellStridePx,
      top: row * cellStridePx,
    });
  }

  const extendedBuffer = await sharp(baseSheetPath)
    .extend({
      top: 0,
      bottom: outHeight - baseMeta.height,
      left: 0,
      right: 0,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .composite(composites)
    .png()
    .toBuffer();

  const codepoint: Record<string, readonly [number, number]> = {};
  for (let i = 0; i < extensions.length; i += 1) {
    const col = i % BASE_COLS;
    const row = BASE_ROWS + Math.floor(i / BASE_COLS);
    codepoint[extensions[i]!] = [col, row];
  }

  const manifest = {
    version: MANIFEST_VERSION,
    sheet: { cols: BASE_COLS, rows: totalRows },
    cellStridePx,
    codepoint,
  };

  mkdirSync(join(publicSheetPath, '..'), { recursive: true });
  writeFileSync(publicSheetPath, extendedBuffer);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const hash = createHash('sha256').update(extendedBuffer).digest('hex').slice(0, 12);
  console.log(
    `✅ Extended spritesheet: ${BASE_COLS}×${totalRows} (${extensions.length} extra tiles), ` +
      `${(extendedBuffer.length / 1024 / 1024).toFixed(2)} MiB, sha256:${hash}`,
  );
  console.log(`   ${publicSheetPath}`);
  console.log(`   ${manifestPath}`);
}

await main();
