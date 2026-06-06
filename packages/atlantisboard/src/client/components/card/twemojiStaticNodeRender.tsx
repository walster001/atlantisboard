import type { Node as PMNode } from '@tiptap/pm/model';
import { createElement } from 'react';
import {
  getEmojiSpriteCell,
  getEmojiSpriteCellForCodepoint,
  getEmojiSpriteSheetMeta,
} from '../../../shared/twemoji/emojiSpriteLookup.js';
import { parseTwemojiCodepointFromSrc } from '../../../shared/twemojiPublic.js';
import { parseTwemojiSpriteCoord } from '../../../shared/twemojiSpriteCoord.js';
import { buildTwemojiSpritesheetReactStyle } from './twemojiSheetSpanStyle.js';

function resolveSpriteCoords(attrs: Record<string, unknown>): {
  readonly x: number;
  readonly y: number;
} | null {
  const sx = parseTwemojiSpriteCoord(attrs.spriteX);
  const sy = parseTwemojiSpriteCoord(attrs.spriteY);
  if (sx != null && sy != null && sx >= 0 && sy >= 0) {
    return { x: sx, y: sy };
  }
  const emoji = typeof attrs.emoji === 'string' ? attrs.emoji.trim() : '';
  if (emoji !== '') {
    const cell = getEmojiSpriteCell(emoji);
    if (cell != null) {
      return cell;
    }
  }
  const cp = parseTwemojiCodepointFromSrc(attrs.src);
  if (cp != null) {
    const cell = getEmojiSpriteCellForCodepoint(cp);
    if (cell != null) {
      return cell;
    }
  }
  return null;
}

/**
 * Custom static render for `twemojiEmoji`: `@tiptap/static-renderer` stringifies `style` by splitting
 * on the first `:` per declaration, which breaks `background-image:url("https://…")`. Use a React
 * style object instead (same output as {@link buildTwemojiSpritesheetReactStyle}).
 */
export function renderCardDescriptionTwemojiStaticNode({ node }: { readonly node: PMNode }) {
  const attrs = node.attrs;
  const emoji = typeof attrs.emoji === 'string' ? attrs.emoji : '';
  if (emoji.trim() === '') {
    return null;
  }
  const alt =
    typeof attrs.alt === 'string' && attrs.alt.trim() !== '' ? attrs.alt : emoji;

  const coords = resolveSpriteCoords(attrs as Record<string, unknown>);
  if (coords == null) {
    return emoji;
  }

  const { cols, rows } = getEmojiSpriteSheetMeta();
  const style = buildTwemojiSpritesheetReactStyle(coords.x, coords.y, cols, rows);
  return createElement('span', {
    className: 'card-desc-twemoji card-desc-twemoji--sheet',
    'data-emoji-node': 'true',
    'data-sprite-x': String(coords.x),
    'data-sprite-y': String(coords.y),
    'data-emoji': emoji,
    role: 'img',
    'aria-label': alt,
    style,
  });
}
