import { ALLOWED_BLOCK_NODES, MAX_DEPTH } from './constants.js';
import {
  validateInlineButtonNode,
  validateMediaBlockNode,
  validateTwemojiNode,
} from './embedNodes.js';
import {
  validateCodeBlockAttrs,
  validateHeadingAttrs,
  validateOrderedListAttrs,
  validateParagraphAttrs,
} from './layoutNodes.js';
import { validateMarks } from './marks.js';
import { isRecord } from './primitives.js';

export function validateNode(node: unknown, depth: number): boolean {
  if (depth > MAX_DEPTH) {
    return false;
  }
  if (!isRecord(node)) {
    return false;
  }
  const type = node.type;
  if (typeof type !== 'string') {
    return false;
  }

  if (type === 'text') {
    if (typeof node.text !== 'string') {
      return false;
    }
    return validateMarks(node.marks);
  }

  if (type === 'hardBreak') {
    const c = node.content;
    return c === undefined || c === null || (Array.isArray(c) && c.length === 0);
  }

  if (!ALLOWED_BLOCK_NODES.has(type)) {
    return false;
  }

  if (type === 'paragraph') {
    if (!validateParagraphAttrs(node.attrs)) {
      return false;
    }
  }

  if (type === 'heading') {
    if (!validateHeadingAttrs(node.attrs)) {
      return false;
    }
  }

  if (type === 'orderedList') {
    if (!validateOrderedListAttrs(node.attrs)) {
      return false;
    }
  }

  if (type === 'codeBlock') {
    if (!validateCodeBlockAttrs(node.attrs)) {
      return false;
    }
  }

  if (type === 'image' || type === 'imageResize' || type === 'video') {
    return validateMediaBlockNode(type, node);
  }

  if (type === 'inlineButton') {
    return validateInlineButtonNode(node);
  }

  if (type === 'twemojiEmoji') {
    return validateTwemojiNode(node);
  }

  const content = node.content;
  if (content === undefined) {
    // Tiptap can serialize empty blocks (for example a trailing paragraph) without `content`.
    // Treat those as valid so media-only / mixed-media descriptions do not get discarded.
    return type !== 'bulletList' && type !== 'orderedList' && type !== 'listItem';
  }
  if (!Array.isArray(content)) {
    return false;
  }
  return content.every((child) => validateNode(child, depth + 1));
}
