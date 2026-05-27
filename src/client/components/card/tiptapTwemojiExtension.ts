import { Node, mergeAttributes } from '@tiptap/core';
import {
  getEmojiSpriteCell,
  getEmojiSpriteCellForCodepoint,
  getEmojiSpriteSheetMeta,
} from '../../../shared/twemoji/emojiSpriteLookup.js';
import { parseTwemojiCodepointFromSrc } from '../../../shared/twemojiPublic.js';
import { parseTwemojiSpriteCoord } from '../../../shared/twemojiSpriteCoord.js';
import { buildTwemojiSpritesheetInlineStyle } from './twemojiSheetSpanStyle.js';

export interface InsertTwemojiOptions {
  emoji: string;
}

export interface TwemojiExtensionOptions {
  HTMLAttributes: Record<string, string>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    twemojiEmoji: {
      insertEmoji: (options: InsertTwemojiOptions) => ReturnType;
    };
  }
}

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

export const TwemojiEmoji = Node.create<TwemojiExtensionOptions>({
  name: 'twemojiEmoji',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: false,
  draggable: false,
  addOptions() {
    return {
      HTMLAttributes: {
        loading: 'lazy',
        decoding: 'async',
      },
    };
  },
  addAttributes() {
    return {
      emoji: { default: '' },
      alt: { default: '' },
      src: { default: '' },
      spriteX: { default: null as number | null },
      spriteY: { default: null as number | null },
      class: { default: 'card-desc-twemoji' },
      'data-emoji-node': { default: 'true' },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'img[data-emoji-node="true"]',
        getAttrs: (element) => {
          if (!(element instanceof HTMLImageElement)) {
            return false;
          }
          const emoji =
            element.getAttribute('data-emoji') ??
            element.getAttribute('alt') ??
            '';
          const cp = parseTwemojiCodepointFromSrc(element.getAttribute('src') ?? '');
          const cell =
            (emoji.trim() !== '' ? getEmojiSpriteCell(emoji) : undefined) ??
            (cp != null ? getEmojiSpriteCellForCodepoint(cp) : undefined);
          if (cell == null) {
            return false;
          }
          return {
            emoji,
            alt: element.getAttribute('alt') ?? emoji,
            spriteX: cell.x,
            spriteY: cell.y,
            src: '',
          };
        },
      },
      {
        tag: 'span[data-emoji-node="true"].card-desc-twemoji--sheet',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }
          const x = element.getAttribute('data-sprite-x');
          const y = element.getAttribute('data-sprite-y');
          if (x == null || y == null) {
            return false;
          }
          const sx = Number.parseInt(x, 10);
          const sy = Number.parseInt(y, 10);
          if (Number.isNaN(sx) || Number.isNaN(sy)) {
            return false;
          }
          const emoji =
            element.getAttribute('data-emoji') ??
            element.getAttribute('aria-label') ??
            '';
          const alt = element.getAttribute('aria-label') ?? emoji;
          return {
            emoji,
            alt,
            spriteX: sx,
            spriteY: sy,
            src: '',
          };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const emoji = typeof HTMLAttributes.emoji === 'string' ? HTMLAttributes.emoji : '';
    const alt =
      typeof HTMLAttributes.alt === 'string' && HTMLAttributes.alt.trim() !== ''
        ? HTMLAttributes.alt
        : emoji;

    const coords = resolveSpriteCoords(HTMLAttributes);
    if (coords == null) {
      return ['span', { 'data-emoji-node': 'true' }, emoji];
    }

    const { cols, rows } = getEmojiSpriteSheetMeta();
    const style = buildTwemojiSpritesheetInlineStyle(coords.x, coords.y, cols, rows);
    return [
      'span',
      mergeAttributes(
        {
          class: 'card-desc-twemoji card-desc-twemoji--sheet',
          'data-emoji-node': 'true',
          'data-sprite-x': String(coords.x),
          'data-sprite-y': String(coords.y),
          'data-emoji': emoji,
          role: 'img',
          'aria-label': alt,
          style,
        },
        {},
      ),
    ];
  },
  addCommands() {
    return {
      insertEmoji:
        (options: InsertTwemojiOptions) =>
        ({ chain }) => {
          const emoji = options.emoji.trim();
          if (emoji.length === 0) {
            return false;
          }
          const cell = getEmojiSpriteCell(emoji);
          if (cell == null) {
            return chain().insertContent(emoji).run();
          }
          return chain()
            .insertContent([
              {
                type: this.name,
                attrs: {
                  emoji,
                  alt: emoji,
                  spriteX: cell.x,
                  spriteY: cell.y,
                  src: '',
                },
              },
              { type: 'text', text: ' ' },
            ])
            .run();
        },
    };
  },
});
