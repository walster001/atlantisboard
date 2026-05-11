import { describe, it, expect } from 'bun:test';
import {
  remapAttachmentRefsInDescriptionHtmlString,
  remapAttachmentRefsInDescriptionJsonString,
} from '../src/shared/cardDescriptionAttachmentRefs.js';

const OLD_ID = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee1111';
const NEW_ID = 'ffffffff-uuuu-4vvv-wwww-xxxxxxxx2222';
const OLD_URL = 'https://storage.example/board/old-card/file.jpg?token=1';
const NEW_URL = 'https://storage.example/board/new-card/file.jpg?token=2';

describe('remapAttachmentRefsInDescriptionJsonString', () => {
  it('rewrites /attachments/:id/file src to the new attachment id', () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'x' }],
        },
        {
          type: 'image',
          attrs: { src: `https://app.example/attachments/${OLD_ID}/file?token=abc` },
          content: [],
        },
      ],
    });
    const out = remapAttachmentRefsInDescriptionJsonString(doc, [{ id: OLD_ID, url: OLD_URL }], [
      { id: NEW_ID, url: NEW_URL },
    ]);
    expect(out).toBeDefined();
    const parsed = JSON.parse(out!) as {
      content: Array<{ type: string; attrs?: { src?: string } }>;
    };
    const img = parsed.content.find((n) => n.type === 'image');
    expect(img?.attrs?.src).toContain(NEW_ID);
    expect(img?.attrs?.src).not.toContain(OLD_ID);
  });

  it('rewrites object-URL src to the new attachment presigned url', () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'x' }],
        },
        {
          type: 'image',
          attrs: { src: OLD_URL },
          content: [],
        },
      ],
    });
    const out = remapAttachmentRefsInDescriptionJsonString(doc, [{ id: OLD_ID, url: OLD_URL }], [
      { id: NEW_ID, url: NEW_URL },
    ]);
    expect(out).toBeDefined();
    const parsed = JSON.parse(out!) as {
      content: Array<{ type: string; attrs?: { src?: string } }>;
    };
    const img = parsed.content.find((n) => n.type === 'image');
    expect(img?.attrs?.src).toBe(NEW_URL);
  });
});

describe('remapAttachmentRefsInDescriptionHtmlString', () => {
  it('substitutes old attachment url and id in html', () => {
    const html = `<p><img src="${OLD_URL}" /></p><a href="/attachments/${OLD_ID}/file">x</a>`;
    const out = remapAttachmentRefsInDescriptionHtmlString(html, [{ id: OLD_ID, url: OLD_URL }], [
      { id: NEW_ID, url: NEW_URL },
    ]);
    expect(out).toContain(NEW_URL);
    expect(out).toContain(NEW_ID);
    expect(out).not.toContain(OLD_URL);
    expect(out).not.toContain(OLD_ID);
  });
});
