import { describe, it, expect } from 'bun:test';
import {
  collectAttachmentIdsFromDescriptionJson,
  collectDescriptionDecorationAttachmentIdsFromDescriptionJson,
  collectReferencedAttachmentIdsFromDescriptionJson,
  collectReferencedDecorationAttachmentIdsFromDescriptionJson,
  descriptionJsonReferencesAttachment,
  extractAttachmentIdFromMediaSrc,
  normalizeCardDescriptionAttachmentUrls,
  remapAttachmentRefsInDescriptionHtmlString,
  remapAttachmentRefsInDescriptionJsonString,
  stripAttachmentFromDescriptionJsonString,
} from '../src/shared/cardDescriptionAttachmentRefs.js';
import { isValidCardDescriptionJsonString } from '../src/shared/validation/cardDescriptionDoc.js';

const OLD_ID = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee1111';
const NEW_ID = 'ffffffff-uuuu-4vvv-wwww-xxxxxxxx2222';
const OLD_URL = 'https://storage.example/board/old-card/file.jpg?token=1';
const NEW_URL = 'https://storage.example/board/new-card/file.jpg?token=2';

describe('collectAttachmentIdsFromDescriptionJson', () => {
  it('collects audio src ids from file URLs without an attachments list', () => {
    const audioId = 'cccccccc-dddd-4eee-ffff-gggggggg3333';
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'audio',
          attrs: {
            src: `/api/v1/attachments/${audioId}/file`,
          },
        },
      ],
    });
    const ids = collectAttachmentIdsFromDescriptionJson(doc);
    expect(ids.has(audioId)).toBe(true);
  });

  it('collects video src and poster ids from file URLs without an attachments list', () => {
    const videoId = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee1111';
    const posterId = 'bbbbbbbb-cccc-4ddd-eeee-ffffffff2222';
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'video',
          attrs: {
            src: `/api/v1/attachments/${videoId}/file`,
            poster: `/api/v1/attachments/${posterId}/file`,
          },
        },
      ],
    });
    const ids = collectAttachmentIdsFromDescriptionJson(doc);
    expect(ids.has(videoId)).toBe(true);
    expect(ids.has(posterId)).toBe(true);
  });
});

describe('collectReferencedAttachmentIdsFromDescriptionJson', () => {
  it('includes video poster attachment ids', () => {
    const videoId = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee1111';
    const posterId = 'bbbbbbbb-cccc-4ddd-eeee-ffffffff2222';
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'video',
          attrs: {
            src: `https://app.example/attachments/${videoId}/file`,
            poster: `https://app.example/attachments/${posterId}/file`,
          },
        },
      ],
    });
    const attachments = [
      { id: videoId, url: 'https://storage.example/v.mp4' },
      { id: posterId, url: 'https://storage.example/poster.jpg' },
    ];
    const refs = collectReferencedAttachmentIdsFromDescriptionJson(doc, attachments);
    expect(refs.has(videoId)).toBe(true);
    expect(refs.has(posterId)).toBe(true);
  });
});

describe('collectDescriptionDecorationAttachmentIdsFromDescriptionJson', () => {
  it('collects inline button iconSrc and audio coverSrc but not primary audio src', () => {
    const iconId = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee1111';
    const coverId = 'bbbbbbbb-cccc-4ddd-eeee-ffffffff2222';
    const audioId = 'cccccccc-dddd-4eee-ffff-gggggggg3333';
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'inlineButton',
          attrs: { iconSrc: `/api/v1/attachments/${iconId}/file`, href: 'https://example.com', buttonText: 'Go' },
        },
        {
          type: 'audio',
          attrs: {
            src: `/api/v1/attachments/${audioId}/file`,
            coverSrc: `/api/v1/attachments/${coverId}/file`,
          },
        },
      ],
    });
    const decorationIds = collectDescriptionDecorationAttachmentIdsFromDescriptionJson(doc);
    expect(decorationIds.has(iconId)).toBe(true);
    expect(decorationIds.has(coverId)).toBe(true);
    expect(decorationIds.has(audioId)).toBe(false);

    const primaryIds = collectAttachmentIdsFromDescriptionJson(doc);
    expect(primaryIds.has(audioId)).toBe(true);
    expect(primaryIds.has(coverId)).toBe(false);
    expect(primaryIds.has(iconId)).toBe(false);
  });

  it('matches decoration refs to attachment rows by object url', () => {
    const coverId = 'bbbbbbbb-cccc-4ddd-eeee-ffffffff2222';
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'audio',
          attrs: {
            src: '/api/v1/attachments/aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee1111/file',
            coverSrc: 'https://storage.example/board/cover.jpg?token=1',
          },
        },
      ],
    });
    const attachments = [{ id: coverId, url: 'https://storage.example/board/cover.jpg?token=1' }];
    const refs = collectReferencedDecorationAttachmentIdsFromDescriptionJson(doc, attachments);
    expect(refs.has(coverId)).toBe(true);
  });
});

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

describe('legacy attachment media paths', () => {
  it('extracts attachment id from card-scoped legacy file URLs', () => {
    const id = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee1111';
    expect(extractAttachmentIdFromMediaSrc(`/api/v1/cards/card-1/attachments/${id}/file`)).toBe(id);
  });

  it('normalizes legacy card-scoped paths to canonical proxy URLs', () => {
    const id = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee1111';
    const raw = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'video',
          attrs: { src: `/api/v1/cards/card-1/attachments/${id}/file` },
        },
      ],
    });
    const normalized = normalizeCardDescriptionAttachmentUrls(raw);
    expect(normalized).toContain(`/api/v1/attachments/${id}/file`);
    expect(normalized).not.toContain('/cards/card-1/attachments/');
  });

  it('drops invalid video poster paths during normalization', () => {
    const videoId = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee1111';
    const raw = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'video',
          attrs: {
            src: `/api/v1/attachments/${videoId}/file`,
            poster: '/api/v1/attachments/poster-id',
          },
        },
      ],
    });
    const normalized = normalizeCardDescriptionAttachmentUrls(raw);
    expect(isValidCardDescriptionJsonString(normalized)).toBe(true);
    const parsed = JSON.parse(normalized) as {
      content: Array<{ attrs?: { poster?: string } }>;
    };
    expect(parsed.content[0]?.attrs?.poster).toBeUndefined();
  });
});

describe('stripAttachmentFromDescriptionJsonString', () => {
  const attId = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee1111';
  const attUrl = 'https://storage.example/bucket/file.jpg?token=1';

  it('removes audio nodes that reference the deleted attachment', () => {
    const raw = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Listen' }] },
        { type: 'audio', attrs: { src: `/api/v1/attachments/${attId}/file` } },
      ],
    });
    const stripped = stripAttachmentFromDescriptionJsonString(raw, attId, attUrl);
    expect(isValidCardDescriptionJsonString(stripped)).toBe(true);
    expect(stripped).toContain('Listen');
    expect(stripped).not.toContain(attId);
  });

  it('removes only the matching attachment and keeps surrounding text', () => {
    const raw = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
        { type: 'imageResize', attrs: { src: `/api/v1/attachments/${attId}/file`, alt: 'img' } },
      ],
    });
    const stripped = stripAttachmentFromDescriptionJsonString(raw, attId, attUrl);
    expect(isValidCardDescriptionJsonString(stripped)).toBe(true);
    expect(stripped).toContain('Hello world');
    expect(stripped).not.toContain(attId);
  });

  it('returns description unchanged when attachment is not referenced inline', () => {
    const orphanId = 'bbbbbbbb-bbbb-4ccc-dddd-eeeeeeee2222';
    const raw = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Keep this text' }] },
        {
          type: 'imageResize',
          attrs: { src: `/api/v1/attachments/${attId}/file`, alt: 'img' },
        },
      ],
    });
    const stripped = stripAttachmentFromDescriptionJsonString(raw, orphanId, 'https://storage.example/other.mp4');
    expect(stripped).toBe(raw);
    expect(stripped).toContain('Keep this text');
    expect(stripped).toContain(attId);
  });

  it('preserves description when stripping would yield invalid JSON', () => {
    const raw = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Notes' }] },
        {
          type: 'video',
          attrs: {
            src: `/api/v1/attachments/${attId}/file`,
            poster: '/api/v1/attachments/bad-poster-id',
          },
        },
      ],
    });
    const stripped = stripAttachmentFromDescriptionJsonString(raw, attId, attUrl);
    expect(stripped).toContain('Notes');
    expect(stripped).not.toContain(attId);
  });

  it('descriptionJsonReferencesAttachment is false for orphan attachments', () => {
    const raw = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Only text' }] }],
    });
    expect(descriptionJsonReferencesAttachment(raw, attId, attUrl)).toBe(false);
  });
});
