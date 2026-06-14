#!/usr/bin/env bun
/**
 * Ensures the committed spritesheet PNG matches `emojiSpriteManifest.json` grid dimensions.
 * Fails CI/release builds when assets are missing or out of sync with lookup/CSS math.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import manifest from '../src/shared/twemoji/emojiSpriteManifest.json';

const projectRoot = join(import.meta.dir, '..');
const sourcePath = join(
  projectRoot,
  'assets/emoji-datasource/twitter/sheets-256/64.png',
);
const publicPath = join(
  projectRoot,
  'public/emoji-datasource/twitter/sheets-256/64.png',
);

async function main(): Promise<void> {
  if (!existsSync(sourcePath)) {
    console.error(
      `Missing committed spritesheet: ${sourcePath}\nRun: bun run build:emoji-sheet`,
    );
    process.exit(1);
  }

  const meta = await sharp(sourcePath).metadata();
  const expectedWidth = manifest.sheet.cols * manifest.cellStridePx;
  const expectedHeight = manifest.sheet.rows * manifest.cellStridePx;

  if (meta.width !== expectedWidth || meta.height !== expectedHeight) {
    console.error(
      `Emoji spritesheet dimension mismatch:\n` +
        `  file: ${sourcePath}\n` +
        `  got: ${meta.width ?? '?'}×${meta.height ?? '?'}\n` +
        `  expected: ${expectedWidth}×${expectedHeight} ` +
        `(manifest ${manifest.version}, ${manifest.sheet.cols}×${manifest.sheet.rows} cells)\n` +
        `Run: bun run build:emoji-sheet`,
    );
    process.exit(1);
  }

  if (!existsSync(publicPath)) {
    console.error(
      `Public spritesheet missing: ${publicPath}\nRun: bun run sync:emoji-sheet`,
    );
    process.exit(1);
  }

  const publicMeta = await sharp(publicPath).metadata();
  if (publicMeta.width !== expectedWidth || publicMeta.height !== expectedHeight) {
    console.error(
      `Public spritesheet out of sync with assets/:\n` +
        `  ${publicPath}\n` +
        `  got: ${publicMeta.width ?? '?'}×${publicMeta.height ?? '?'}\n` +
        `Run: bun run sync:emoji-sheet`,
    );
    process.exit(1);
  }

  console.log(
    `✅ Emoji spritesheet OK (${expectedWidth}×${expectedHeight}, manifest ${manifest.version})`,
  );
}

await main();
