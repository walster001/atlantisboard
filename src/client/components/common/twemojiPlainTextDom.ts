import {
  getEmojiSpriteCell,
  getEmojiSpriteSheetMeta,
} from '../../../shared/twemoji/emojiSpriteLookup.js';
import { segmentGraphemes } from '../../../shared/utils/segmentGraphemes.js';
import { twemojiRecognizesGrapheme } from '../../../shared/utils/twemojiDetect.js';
import { buildTwemojiSpritesheetInlineStyle } from '../card/twemojiSheetSpanStyle.js';

/**
 * Renders plain text into `root` with spritesheet emoji spans (no `<img>` / per-tile PNGs).
 */
export function applyTwemojiPlainTextDom(root: HTMLElement, text: string): void {
  root.replaceChildren();
  const { cols, rows } = getEmojiSpriteSheetMeta();
  for (const grapheme of segmentGraphemes(text)) {
    if (grapheme !== '' && twemojiRecognizesGrapheme(grapheme)) {
      const cell = getEmojiSpriteCell(grapheme);
      if (cell != null) {
        const span = document.createElement('span');
        span.className = 'emoji card-desc-twemoji card-desc-twemoji--sheet';
        span.setAttribute('role', 'img');
        span.setAttribute('aria-label', grapheme);
        span.style.cssText = buildTwemojiSpritesheetInlineStyle(
          cell.x,
          cell.y,
          cols,
          rows,
        );
        root.appendChild(span);
        continue;
      }
    }
    root.appendChild(document.createTextNode(grapheme));
  }
}
