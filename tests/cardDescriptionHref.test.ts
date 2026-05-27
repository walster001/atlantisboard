import { describe, expect, it } from 'bun:test';
import { isValidCardDescriptionDoc } from '../src/shared/validation/cardDescriptionDoc.js';

function linkDoc(href: string): unknown {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'link',
            marks: [{ type: 'link', attrs: { href } }],
          },
        ],
      },
    ],
  };
}

describe('cardDescriptionDoc link href validation', () => {
  it('allows https, mailto, and same-origin relative paths', () => {
    expect(isValidCardDescriptionDoc(linkDoc('https://example.com/path'))).toBe(true);
    expect(isValidCardDescriptionDoc(linkDoc('mailto:user@example.com'))).toBe(true);
    expect(isValidCardDescriptionDoc(linkDoc('/boards/1'))).toBe(true);
    expect(isValidCardDescriptionDoc(linkDoc('./relative'))).toBe(true);
    expect(isValidCardDescriptionDoc(linkDoc('../up'))).toBe(true);
    expect(isValidCardDescriptionDoc(linkDoc('#section'))).toBe(true);
  });

  it('rejects http:// URLs', () => {
    expect(isValidCardDescriptionDoc(linkDoc('http://example.com'))).toBe(false);
    expect(isValidCardDescriptionDoc(linkDoc('http://localhost/path'))).toBe(false);
  });
});
