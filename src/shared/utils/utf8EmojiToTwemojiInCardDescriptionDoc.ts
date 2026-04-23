import type { JSONContent } from '@tiptap/core';
import twemoji from 'twemoji';
import { getTwitterEmojiSpriteCell } from '../twemoji/twitterEmojiSpriteLookup.js';

/** Runtime API; package typings omit `test`. */
function twemojiTest(text: string): boolean {
  return (twemoji as unknown as { test(s: string): boolean }).test(text);
}

function segmentGraphemes(input: string): readonly string[] {
  const IntlAny = globalThis.Intl as unknown as {
    Segmenter?: new (locales?: unknown, options?: { granularity: string }) => {
      segment(s: string): Iterable<{ segment: string }>;
    };
  };
  if (typeof IntlAny.Segmenter === 'function') {
    const seg = new IntlAny.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(seg.segment(input), (part) => part.segment);
  }
  const out: string[] = [];
  for (let i = 0; i < input.length; ) {
    const cp = input.codePointAt(i);
    if (cp === undefined) {
      break;
    }
    const w = cp > 0xffff ? 2 : 1;
    out.push(input.slice(i, i + w));
    i += w;
  }
  return out;
}

function twemojiInlineNode(grapheme: string): JSONContent {
  const cell = getTwitterEmojiSpriteCell(grapheme);
  if (cell != null) {
    return {
      type: 'twemojiEmoji',
      attrs: {
        emoji: grapheme,
        alt: grapheme,
        spriteX: cell.x,
        spriteY: cell.y,
        src: '',
      },
    };
  }
  const codePoint = twemoji.convert.toCodePoint(grapheme);
  return {
    type: 'twemojiEmoji',
    attrs: {
      emoji: grapheme,
      alt: grapheme,
      spriteX: null,
      spriteY: null,
      src: `/twemoji/72x72/${codePoint}.png`,
    },
  };
}

/**
 * Splits a text string into `text` + `twemojiEmoji` (+ spacer `text`) nodes wherever Twemoji recognizes emoji.
 * Mirrors {@link TwemojiEmoji} insert behaviour (spritesheet cell when known, else `/twemoji/72x72/*.png`).
 */
function splitTextNodeToInlinePieces(text: string): JSONContent[] {
  if (text === '') {
    return [];
  }
  const out: JSONContent[] = [];
  let buf = '';
  const flushBuf = (): void => {
    if (buf !== '') {
      out.push({ type: 'text', text: buf });
      buf = '';
    }
  };
  for (const g of segmentGraphemes(text)) {
    if (g !== '' && twemojiTest(g)) {
      flushBuf();
      out.push(twemojiInlineNode(g));
      out.push({ type: 'text', text: ' ' });
    } else {
      buf += g;
    }
  }
  flushBuf();
  return out;
}

function transformContentArray(
  nodes: JSONContent[] | undefined,
  inCodeBlock: boolean,
): JSONContent[] | undefined {
  if (nodes == null || nodes.length === 0) {
    return nodes;
  }
  if (inCodeBlock) {
    return nodes.map((child) => transformCardDescriptionNode(child, true));
  }
  const next: JSONContent[] = [];
  for (const child of nodes) {
    if (child.type === 'text' && typeof child.text === 'string') {
      const pieces = splitTextNodeToInlinePieces(child.text);
      for (const piece of pieces) {
        if (piece.type === 'text' && child.marks != null && child.marks.length > 0) {
          next.push({ ...piece, marks: child.marks });
        } else {
          next.push(piece);
        }
      }
    } else {
      next.push(transformCardDescriptionNode(child, false));
    }
  }
  return next;
}

function transformCardDescriptionNode(node: JSONContent, inCodeBlock: boolean): JSONContent {
  if (node.type === 'codeBlock') {
    const next = transformContentArray(node.content as JSONContent[] | undefined, true);
    return { ...node, content: next ?? [] } as JSONContent;
  }
  const blockInCode = inCodeBlock || node.type === 'codeBlock';
  const rawContent = node.content as JSONContent[] | undefined;
  if (rawContent != null && Array.isArray(rawContent)) {
    const next = transformContentArray(rawContent, blockInCode);
    return { ...node, content: next ?? [] } as JSONContent;
  }
  return node;
}

/**
 * Walks a card-description TipTap JSON doc and replaces UTF-8 emoji in `text` nodes with `twemojiEmoji` atoms.
 * Used on board import so read-only / static render match in-editor Twemoji. Skips `codeBlock` bodies.
 */
export function applyUtf8EmojiToTwemojiInCardDescriptionDoc(doc: JSONContent): JSONContent {
  return transformCardDescriptionNode(doc, false);
}
