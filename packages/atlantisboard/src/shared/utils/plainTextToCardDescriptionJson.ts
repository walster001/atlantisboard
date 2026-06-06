import type { JSONContent } from '@tiptap/core';
import {
  CARD_DESCRIPTION_JSON_MAX_LENGTH,
  CARD_DESCRIPTION_TEXT_MAX_LENGTH,
} from '../constants/cardDescription.js';
import { isValidCardDescriptionDoc } from '../validation/cardDescriptionDoc.js';
import { applyUtf8EmojiToTwemojiInCardDescriptionDoc } from './utf8EmojiToTwemojiInCardDescriptionDoc.js';

/**
 * Wraps plain text in a minimal Tiptap JSON document (paragraphs per line).
 * Used by import paths that only have plain text descriptions.
 */
export function plainTextToCardDescriptionJson(plain: string): string | undefined {
  const trimmed = plain.trim();
  if (trimmed === '') {
    return undefined;
  }
  const clipped = trimmed.slice(0, CARD_DESCRIPTION_TEXT_MAX_LENGTH);
  const lines = clipped.split('\n');
  const content = lines.map((line) => ({
    type: 'paragraph' as const,
    content:
      line.length > 0 ? [{ type: 'text' as const, text: line }] : [{ type: 'hardBreak' as const }],
  }));
  const doc = applyUtf8EmojiToTwemojiInCardDescriptionDoc({ type: 'doc', content } as JSONContent);
  let json = JSON.stringify(doc);
  if (json.length <= CARD_DESCRIPTION_JSON_MAX_LENGTH && isValidCardDescriptionDoc(doc)) {
    return json;
  }
  const fallbackDoc = applyUtf8EmojiToTwemojiInCardDescriptionDoc({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: clipped.slice(0, 5000) }],
      },
    ],
  } as JSONContent);
  json = JSON.stringify(fallbackDoc);
  if (json.length <= CARD_DESCRIPTION_JSON_MAX_LENGTH && isValidCardDescriptionDoc(fallbackDoc)) {
    return json;
  }
  return undefined;
}
