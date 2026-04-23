/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { plainTextToCardDescriptionJson } from '../src/shared/utils/plainTextToCardDescriptionJson.js';
import { markdownToCardDescriptionJson } from '../src/shared/utils/markdownToCardDescriptionJson.js';
import { applyUtf8EmojiToTwemojiInCardDescriptionDoc } from '../src/shared/utils/utf8EmojiToTwemojiInCardDescriptionDoc.js';
import { isValidCardDescriptionDoc } from '../src/shared/validation/cardDescriptionDoc.js';

describe('import: UTF-8 emoji → twemojiEmoji in card description JSON', () => {
  it('plainTextToCardDescriptionJson inserts twemojiEmoji for inline emoji', () => {
    const json = plainTextToCardDescriptionJson('Hello 😉 world');
    expect(json).toBeDefined();
    const doc = JSON.parse(json!) as JSONContent;
    expect(isValidCardDescriptionDoc(doc)).toBe(true);
    const para = doc.content?.[0];
    expect(para?.type).toBe('paragraph');
    const inline = para?.content ?? [];
    const types = inline.map((n) => n.type);
    expect(types).toContain('twemojiEmoji');
    const tw = inline.find((n) => n.type === 'twemojiEmoji');
    expect(tw?.attrs && (tw.attrs as { emoji?: string }).emoji).toBe('😉');
  });

  it('markdownToCardDescriptionJson converts emoji in paragraphs', () => {
    const json = markdownToCardDescriptionJson('Line with 😁 emoji.');
    expect(json).toBeDefined();
    const doc = JSON.parse(json!) as JSONContent;
    expect(isValidCardDescriptionDoc(doc)).toBe(true);
    const flat = JSON.stringify(doc);
    expect(flat).toContain('twemojiEmoji');
    expect(flat).toContain('"emoji":"😁"');
  });

  it('applyUtf8EmojiToTwemojiInCardDescriptionDoc leaves codeBlock text unchanged', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'text' },
          content: [{ type: 'text', text: 'const x = "😀";' }],
        },
      ],
    };
    const out = applyUtf8EmojiToTwemojiInCardDescriptionDoc(doc);
    const cb = out.content?.[0];
    expect(cb?.type).toBe('codeBlock');
    const text = cb?.content?.[0];
    expect(text?.type).toBe('text');
    expect((text as { text?: string }).text).toBe('const x = "😀";');
  });
});
