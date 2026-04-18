import type { Editor } from '@tiptap/core';
import {
  CARD_DESCRIPTION_JSON_MAX_LENGTH,
  CARD_DESCRIPTION_TEXT_MAX_LENGTH,
} from '../../../shared/constants/cardDescription.js';
import { getCardDescriptionTextLength } from './cardDescriptionTiptap.js';

export function serializeCardDescriptionEditor(
  editor: Editor | null,
): { ok: true; jsonString: string } | { ok: false; reason: string } {
  if (editor == null || editor.isDestroyed) {
    return { ok: false, reason: 'Editor not ready.' };
  }
  const jsonString = JSON.stringify(editor.getJSON());
  const bytes = new TextEncoder().encode(jsonString).length;
  if (bytes > CARD_DESCRIPTION_JSON_MAX_LENGTH) {
    return {
      ok: false,
      reason: `Description data is too large (max ${CARD_DESCRIPTION_JSON_MAX_LENGTH} bytes).`,
    };
  }
  const chars = getCardDescriptionTextLength(editor.getJSON());
  if (chars > CARD_DESCRIPTION_TEXT_MAX_LENGTH) {
    return {
      ok: false,
      reason: `Description cannot exceed ${CARD_DESCRIPTION_TEXT_MAX_LENGTH} characters.`,
    };
  }
  return { ok: true, jsonString };
}
