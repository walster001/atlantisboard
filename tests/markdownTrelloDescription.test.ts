import { describe, it, expect } from 'bun:test';
import { markdownToCardDescriptionJson } from '../src/shared/utils/markdownToCardDescriptionJson.js';
import { isValidCardDescriptionDoc } from '../src/shared/validation/cardDescriptionDoc.js';
import {
  buildTrelloImportInlineButton,
  shouldTrelloLinkBecomeInlineButton,
} from '../src/shared/utils/trelloImportInlineButton.js';
import { applyTrelloSmartLinksToDescriptionDoc } from '../src/shared/utils/trelloSmartLinksPostProcess.js';

describe('markdownToCardDescriptionJson', () => {
  it('produces valid doc for bold and lists', () => {
    const md = '**Hi**\n\n- one\n- two';
    const json = markdownToCardDescriptionJson(md);
    expect(json).toBeDefined();
    const doc = JSON.parse(json!) as unknown;
    expect(isValidCardDescriptionDoc(doc)).toBe(true);
  });

  it('includes text for tight bullet lists (hidden paragraph tokens)', () => {
    const md = '- alpha\n- beta';
    const json = markdownToCardDescriptionJson(md);
    expect(json).toBeDefined();
    const doc = JSON.parse(json!) as {
      content: Array<{
        type: string;
        content?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
      }>;
    };
    const list = doc.content.find((n) => n.type === 'bulletList');
    expect(list?.content?.length).toBe(2);
    const texts =
      list?.content?.map((li) => (li.content?.[0] as { content?: Array<{ text?: string }> })?.content?.[0]?.text) ??
      [];
    expect(texts).toEqual(['alpha', 'beta']);
  });

  it('includes text for tight ordered lists', () => {
    const md = '1. first item\n2. second item';
    const json = markdownToCardDescriptionJson(md);
    expect(json).toBeDefined();
    const doc = JSON.parse(json!) as {
      content: Array<{
        type: string;
        content?: Array<{ type: string; content?: Array<{ content?: Array<{ text?: string }> }> }>;
      }>;
    };
    const list = doc.content.find((n) => n.type === 'orderedList');
    expect(list?.content?.length).toBe(2);
    const texts =
      list?.content?.map((li) => li.content?.[0]?.content?.[0]?.text) ?? [];
    expect(texts).toEqual(['first item', 'second item']);
  });

  it('converts HTML ordered lists to orderedList nodes', () => {
    const md =
      '**STANDARDS**\n\n<ol><li>Please log on early</li><li>Smile</li></ol>\n\nThanks.';
    const json = markdownToCardDescriptionJson(md);
    expect(json).toBeDefined();
    const doc = JSON.parse(json!) as {
      content: Array<{ type: string; content?: unknown[] }>;
    };
    const list = doc.content.find((n) => n.type === 'orderedList');
    expect(list).toBeDefined();
    expect((list?.content as unknown[] | undefined)?.length).toBe(2);
    expect(isValidCardDescriptionDoc(doc)).toBe(true);
  });

  it('honors ol start when converting HTML ordered lists', () => {
    const md = '<ol start="3"><li>third</li><li>fourth</li></ol>';
    const json = markdownToCardDescriptionJson(md);
    expect(json).toBeDefined();
    const doc = JSON.parse(json!) as {
      content: Array<{ type: string; attrs?: { start?: number }; content?: unknown[] }>;
    };
    const list = doc.content.find((n) => n.type === 'orderedList');
    expect(list).toBeDefined();
    expect(list?.attrs?.start).toBe(3);
    expect(isValidCardDescriptionDoc(doc)).toBe(true);
  });

  it('handles trello-style titled link for smart button', () => {
    const md = '[Watch video](https://www.dropbox.com/s/x/file.mp4?dl=0 "smartCard-inline")';
    const json = markdownToCardDescriptionJson(md);
    expect(json).toBeDefined();
    const doc = JSON.parse(json!) as { content: Array<{ type: string }> };
    expect(doc.content.some((n) => n.type === 'inlineButton')).toBe(true);
    expect(isValidCardDescriptionDoc(doc)).toBe(true);
  });

  it('keeps plain external link as paragraph link when not smart', () => {
    const md = '[Example](https://example.com/path)';
    const json = markdownToCardDescriptionJson(md);
    expect(json).toBeDefined();
    const doc = JSON.parse(json!) as { content: unknown[] };
    expect(doc.content.every((n) => (n as { type: string }).type !== 'inlineButton')).toBe(true);
    expect(isValidCardDescriptionDoc(doc)).toBe(true);
  });
});

describe('trelloImportInlineButton', () => {
  it('detects trello card URL as inline button candidate', () => {
    expect(
      shouldTrelloLinkBecomeInlineButton('https://trello.com/c/abc123/title', ''),
    ).toBe(true);
  });

  it('builds valid inlineButton node', () => {
    const node = buildTrelloImportInlineButton('https://trello.com/c/abc123/card', 'My card');
    expect(node).not.toBeNull();
    expect(isValidCardDescriptionDoc({ type: 'doc', content: [node!] })).toBe(true);
  });
});

describe('applyTrelloSmartLinksToDescriptionDoc', () => {
  it('replaces eligible paragraph with inlineButton', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Open',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'https://drive.google.com/file/d/x/view',
                    title: 'smartCard-inline',
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    applyTrelloSmartLinksToDescriptionDoc(doc);
    expect((doc.content[0] as { type: string }).type).toBe('inlineButton');
    expect(isValidCardDescriptionDoc(doc)).toBe(true);
  });
});

describe('trelloLabelColors', () => {
  it('maps trello color keys to hex', async () => {
    const { trelloColorKeyToHex, trelloLabelDisplayName } = await import(
      '../src/shared/import/trelloLabelColors.js'
    );
    expect(trelloColorKeyToHex('sky')).toMatch(/^#/);
    expect(trelloLabelDisplayName('', 'green')).toBe('green');
    expect(trelloLabelDisplayName('', 'sky_light')).toBe('sky_light');
  });
});
