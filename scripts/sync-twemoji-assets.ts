#!/usr/bin/env bun
/**
 * 1) Twemoji v14.0.2 `assets/72x72` PNG tiles → `public/twemoji/72x72/` (card description / titles).
 * 2) emoji-datasource-twitter spritesheet → `public/emoji-datasource/twitter/sheets-256/64.png` (emoji-mart picker).
 *
 * Run: `bun run scripts/sync-twemoji-assets.ts`
 * Invoked from `build:client` / `build-client-with-css` and `scripts/dev.ts`.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const TWEMOJI_TAG = 'v14.0.2';
const TARBALL_URL = `https://github.com/twitter/twemoji/archive/refs/tags/${TWEMOJI_TAG}.tar.gz`;
const SAMPLE_FILE = '1f600.png';

const EMOJI_DATASOURCE_VERSION = '15.0.1';
const SPRITESHEET_NAME = '64.png';

const projectRoot = join(import.meta.dir, '..');
const publicTwemojiRoot = join(projectRoot, 'public/twemoji');
const destDir = join(publicTwemojiRoot, '72x72');
const versionFile = join(publicTwemojiRoot, '.version');
const tempRoot = join(projectRoot, '.temp/twemoji-sync');
const tarPath = join(tempRoot, 'twemoji.tar.gz');

function isTwemojiSynced(): boolean {
  if (!existsSync(versionFile) || !existsSync(join(destDir, SAMPLE_FILE))) {
    return false;
  }
  return readFileSync(versionFile, 'utf-8').trim() === TWEMOJI_TAG;
}

function syncEmojiMartSpritesheet(): void {
  const src = join(
    projectRoot,
    'node_modules/emoji-datasource-twitter/img/twitter/sheets-256',
    SPRITESHEET_NAME,
  );
  const destDirSprites = join(
    projectRoot,
    'public/emoji-datasource/twitter/sheets-256',
  );
  const dest = join(destDirSprites, SPRITESHEET_NAME);
  const marker = join(projectRoot, 'public/emoji-datasource/.spritesheet-version');

  if (!existsSync(src)) {
    throw new Error(
      'emoji-datasource-twitter is missing (expected at node_modules). Run `bun install`.',
    );
  }

  if (
    existsSync(dest) &&
    existsSync(marker) &&
    readFileSync(marker, 'utf-8').trim() === EMOJI_DATASOURCE_VERSION
  ) {
    console.log(
      `Emoji-mart Twitter spritesheet already at public/emoji-datasource/twitter/sheets-256/${SPRITESHEET_NAME} — skip.`,
    );
    return;
  }

  mkdirSync(destDirSprites, { recursive: true });
  cpSync(src, dest);
  mkdirSync(join(projectRoot, 'public/emoji-datasource'), { recursive: true });
  writeFileSync(marker, `${EMOJI_DATASOURCE_VERSION}\n`);
  console.log(
    `✅ Emoji-mart spritesheet copied to public/emoji-datasource/twitter/sheets-256/${SPRITESHEET_NAME}`,
  );
}

async function syncTwemojiTiles(): Promise<void> {
  if (isTwemojiSynced()) {
    console.log(`Twemoji ${TWEMOJI_TAG} assets already present under public/twemoji/72x72 — skip.`);
    return;
  }

  mkdirSync(tempRoot, { recursive: true });
  console.log(`Downloading ${TARBALL_URL} …`);
  const res = await fetch(TARBALL_URL);
  if (!res.ok) {
    throw new Error(`Failed to download Twemoji tarball: ${res.status} ${res.statusText}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  writeFileSync(tarPath, buf);

  const extractDir = join(tempRoot, 'extracted');
  rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });

  execFileSync('tar', ['-xzf', tarPath, '-C', extractDir], { stdio: 'inherit' });

  const entries = readdirSync(extractDir);
  const rootFolder = entries.find((e) => e.startsWith('twemoji-'));
  if (rootFolder == null) {
    throw new Error('Twemoji tarball had unexpected layout (no twemoji-* root folder).');
  }

  const source72 = join(extractDir, rootFolder, 'assets', '72x72');
  if (!existsSync(source72)) {
    throw new Error(`Missing assets/72x72 in tarball: ${source72}`);
  }

  mkdirSync(publicTwemojiRoot, { recursive: true });
  rmSync(destDir, { recursive: true, force: true });
  cpSync(source72, destDir, { recursive: true });
  writeFileSync(versionFile, `${TWEMOJI_TAG}\n`);

  rmSync(tempRoot, { recursive: true, force: true });
  console.log(`✅ Twemoji ${TWEMOJI_TAG} PNGs copied to public/twemoji/72x72/`);
}

async function main(): Promise<void> {
  await syncTwemojiTiles();
  syncEmojiMartSpritesheet();
}

await main();
