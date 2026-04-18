/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import {
  emptyCardDescriptionJson,
  isCardDescriptionEmpty,
} from '../src/client/components/card/cardDescriptionTiptap.js';

describe('isCardDescriptionEmpty', () => {
  it('treats default empty doc (single hardBreak) as empty', () => {
    expect(isCardDescriptionEmpty(emptyCardDescriptionJson)).toBe(true);
  });

  it('treats two paragraphs each with only a hardBreak as non-empty (vertical spacing)', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'hardBreak' }] },
        { type: 'paragraph', content: [{ type: 'hardBreak' }] },
      ],
    };
    expect(isCardDescriptionEmpty(doc)).toBe(false);
  });

  it('treats one paragraph with two hardBreaks as non-empty', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'hardBreak' }, { type: 'hardBreak' }] }],
    };
    expect(isCardDescriptionEmpty(doc)).toBe(false);
  });

  it('treats visible text as non-empty', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
    };
    expect(isCardDescriptionEmpty(doc)).toBe(false);
  });
});
