import {
  CARD_DESCRIPTION_JSON_MAX_LENGTH,
  CARD_DESCRIPTION_TEXT_MAX_LENGTH,
} from '../constants/cardDescription.js';
import { isValidCardDescriptionDoc } from '../validation/cardDescriptionDoc.js';

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
    content: line.length > 0 ? [{ type: 'text' as const, text: line }] : [],
  }));
  const doc = { type: 'doc' as const, content };
  let json = JSON.stringify(doc);
  if (json.length <= CARD_DESCRIPTION_JSON_MAX_LENGTH && isValidCardDescriptionDoc(doc)) {
    return json;
  }
  const fallbackDoc = {
    type: 'doc' as const,
    content: [
      {
        type: 'paragraph' as const,
        content: [{ type: 'text' as const, text: clipped.slice(0, 5000) }],
      },
    ],
  };
  json = JSON.stringify(fallbackDoc);
  if (json.length <= CARD_DESCRIPTION_JSON_MAX_LENGTH && isValidCardDescriptionDoc(fallbackDoc)) {
    return json;
  }
  return undefined;
}
