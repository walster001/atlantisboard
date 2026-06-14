/**
 * Copies the committed Twitter emoji spritesheet from `assets/` into `public/` for static serving.
 */

import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

const projectRoot = join(import.meta.dir, '..');
const sourcePath = join(
  projectRoot,
  'assets/emoji-datasource/twitter/sheets-256/64.png',
);
const destPath = join(
  projectRoot,
  'public/emoji-datasource/twitter/sheets-256/64.png',
);

export function syncEmojiSpritesheetToPublic(): void {
  if (!existsSync(sourcePath)) {
    throw new Error(
      `Missing committed spritesheet: ${sourcePath}. Run: bun run build:emoji-sheet`,
    );
  }

  mkdirSync(dirname(destPath), { recursive: true });
  copyFileSync(sourcePath, destPath);
}

if (import.meta.main) {
  try {
    syncEmojiSpritesheetToPublic();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
