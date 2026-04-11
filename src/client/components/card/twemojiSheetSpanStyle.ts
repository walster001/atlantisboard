import { EMOJI_DATASOURCE_TWITTER_SPRITESHEET_64_PUBLIC_PATH } from '../../../shared/twemojiPublic.js';

/** Mirrors emoji-mart / emoji-datasource background math for the 64px Twitter sheet. */
export function buildTwemojiSpritesheetInlineStyle(
  x: number,
  y: number,
  cols: number,
  rows: number,
  sheetUrl: string = EMOJI_DATASOURCE_TWITTER_SPRITESHEET_64_PUBLIC_PATH,
): string {
  const bgw = 100 * cols;
  const bgh = 100 * rows;
  const posX = cols <= 1 ? 0 : (100 / (cols - 1)) * x;
  const posY = rows <= 1 ? 0 : (100 / (rows - 1)) * y;
  return [
    `background-image:url("${sheetUrl}")`,
    `background-size:${bgw}% ${bgh}%`,
    `background-position:${posX}% ${posY}%`,
  ].join(';');
}
