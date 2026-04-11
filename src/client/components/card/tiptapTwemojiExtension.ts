import { Node, mergeAttributes } from '@tiptap/core';
import twemoji from 'twemoji';
import { rewriteTwemojiSrcToPublic } from '../../../shared/twemojiPublic.js';
import {
  getTwitterEmojiSheetMeta,
  getTwitterEmojiSpriteCell,
} from './twitterEmojiSpriteLookup.js';
import { buildTwemojiSpritesheetInlineStyle } from './twemojiSheetSpanStyle.js';

export interface InsertTwemojiOptions {
  emoji: string;
}

export interface TwemojiExtensionOptions {
  baseUrl: string;
  fileExtension: string;
  HTMLAttributes: Record<string, string>;
}

const twemojiSrcCache = new Map<string, string>();

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    twemojiEmoji: {
      insertEmoji: (options: InsertTwemojiOptions) => ReturnType;
    };
  }
}

function toTwemojiSrc(emoji: string, baseUrl: string, fileExtension: string): string {
  const cacheKey = `${baseUrl}\0${emoji}`;
  const cached = twemojiSrcCache.get(cacheKey);
  if (cached != null) {
    return cached;
  }
  const codePoint = twemoji.convert.toCodePoint(emoji);
  const src = `${baseUrl}${codePoint}${fileExtension}`;
  twemojiSrcCache.set(cacheKey, src);
  return src;
}

function parseSpriteCoord(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isInteger(raw)) {
    return raw;
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number.parseInt(raw, 10);
    return Number.isNaN(n) ? null : n;
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
      baseUrl: '/twemoji/72x72/',
      fileExtension: '.png',
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
      { tag: 'img[data-emoji-node="true"]' },
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

    const sx = parseSpriteCoord(HTMLAttributes.spriteX);
    const sy = parseSpriteCoord(HTMLAttributes.spriteY);

    if (sx != null && sy != null && sx >= 0 && sy >= 0) {
      const { cols, rows } = getTwitterEmojiSheetMeta();
      const style = buildTwemojiSpritesheetInlineStyle(sx, sy, cols, rows);
      return [
        'span',
        mergeAttributes(
          {
            class: 'card-desc-twemoji card-desc-twemoji--sheet',
            'data-emoji-node': 'true',
            'data-sprite-x': String(sx),
            'data-sprite-y': String(sy),
            'data-emoji': emoji,
            role: 'img',
            'aria-label': alt,
            style,
          },
          {},
        ),
      ];
    }

    const src = rewriteTwemojiSrcToPublic(HTMLAttributes.src);
    return [
      'img',
      mergeAttributes(this.options.HTMLAttributes, {
        emoji: HTMLAttributes.emoji,
        alt: HTMLAttributes.alt ?? HTMLAttributes.emoji,
        src,
        class: 'card-desc-twemoji',
        'data-emoji-node': 'true',
      }),
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
          const cell = getTwitterEmojiSpriteCell(emoji);
          if (cell != null) {
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
          }
          const src = toTwemojiSrc(emoji, this.options.baseUrl, this.options.fileExtension);
          return chain()
            .insertContent([
              {
                type: this.name,
                attrs: {
                  emoji,
                  src,
                  alt: emoji,
                  spriteX: null,
                  spriteY: null,
                },
              },
              { type: 'text', text: ' ' },
            ])
            .run();
        },
    };
  },
});
