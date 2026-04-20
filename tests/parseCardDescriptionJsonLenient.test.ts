import { describe, expect, it } from 'bun:test';
import {
  isCardDescriptionEmpty,
  parseCardDescriptionJson,
} from '../src/client/components/card/cardDescriptionTiptap.js';

describe('parseCardDescriptionJson lenient fallback (imports)', () => {
  it('loads a doc that fails strict validation but is a well-formed doc with text', () => {
    const raw = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { someLegacyImportAttr: 'x' },
          content: [{ type: 'text', text: 'Imported body' }],
        },
      ],
    });
    const doc = parseCardDescriptionJson(raw);
    expect(isCardDescriptionEmpty(doc)).toBe(false);
  });

  it('still returns empty placeholder for invalid JSON', () => {
    const doc = parseCardDescriptionJson('{ not json');
    expect(isCardDescriptionEmpty(doc)).toBe(true);
  });
});
