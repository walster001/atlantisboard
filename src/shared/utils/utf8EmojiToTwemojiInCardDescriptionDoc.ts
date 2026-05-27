import type { JSONContent } from '@tiptap/core';
import { getEmojiSpriteCell } from '../twemoji/emojiSpriteLookup.js';
import { segmentGraphemes } from './segmentGraphemes.js';
import { twemojiRecognizesGrapheme } from './twemojiDetect.js';

function twemojiInlineNode(grapheme: string): JSONContent | null {
  const cell = getEmojiSpriteCell(grapheme);
  if (cell == null) {
    return null;
  }
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

/**
 * Splits a text string into `text` + `twemojiEmoji` (+ spacer `text`) nodes wherever Twemoji recognizes emoji.
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
    if (g !== '' && twemojiRecognizesGrapheme(g)) {
      flushBuf();
      const node = twemojiInlineNode(g);
      if (node != null) {
        out.push(node);
        out.push({ type: 'text', text: ' ' });
      } else {
        buf += g;
      }
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
