import type { Node as PMNode } from '@tiptap/pm/model';
import { createElement } from 'react';
import { rewriteTwemojiSrcToPublic } from '../../../shared/twemojiPublic.js';
import { parseTwemojiSpriteCoord } from '../../../shared/twemojiSpriteCoord.js';
import { getTwitterEmojiSheetMeta } from '../../../shared/twemoji/twitterEmojiSpriteLookup.js';
import { buildTwemojiSpritesheetReactStyle } from './twemojiSheetSpanStyle.js';

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
  const sx = parseTwemojiSpriteCoord(attrs.spriteX);
  const sy = parseTwemojiSpriteCoord(attrs.spriteY);
  if (sx != null && sy != null && sx >= 0 && sy >= 0) {
    const { cols, rows } = getTwitterEmojiSheetMeta();
    const style = buildTwemojiSpritesheetReactStyle(sx, sy, cols, rows);
    return createElement('span', {
      className: 'card-desc-twemoji card-desc-twemoji--sheet',
      'data-emoji-node': 'true',
      'data-sprite-x': String(sx),
      'data-sprite-y': String(sy),
      'data-emoji': emoji,
      role: 'img',
      'aria-label': alt,
      style,
    });
  }
  const src = rewriteTwemojiSrcToPublic(attrs.src);
  return createElement('img', {
    className: 'card-desc-twemoji',
    'data-emoji-node': 'true',
    alt,
    src,
    loading: 'lazy',
    decoding: 'async',
  });
}
