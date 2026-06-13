import { isValidCardDescriptionJsonString } from './validation/cardDescriptionDoc.js';

/** Matches API file route: .../attachments/:id/file */
const ATTACHMENT_FILE_PATH =
  /\/attachments\/([^/?#]+)\/file(?:\?|#|$)/;

/** Legacy card-scoped path: .../cards/:cardId/attachments/:id/file */
const LEGACY_CARD_ATTACHMENT_FILE_PATH =
  /\/cards\/[^/]+\/attachments\/([^/?#]+)\/file(?:\?|#|$)/;

export function buildAttachmentProxyMediaPath(attachmentId: string): string {
  return `/api/v1/attachments/${encodeURIComponent(attachmentId)}/file`;
}

export function extractAttachmentIdFromMediaSrc(src: string): string | null {
  const trimmed = src.trim();
  if (trimmed === '') {
    return null;
  }
  const match =
    ATTACHMENT_FILE_PATH.exec(trimmed) ?? LEGACY_CARD_ATTACHMENT_FILE_PATH.exec(trimmed);
  if (!match?.[1]) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function normalizeAttachmentMediaSrcToProxyPath(src: string): string {
  const trimmed = src.trim();
  if (trimmed === '') {
    return trimmed;
  }
  const attachmentId = extractAttachmentIdFromMediaSrc(trimmed);
  if (attachmentId == null) {
    return trimmed;
  }
  return buildAttachmentProxyMediaPath(attachmentId);
}

/** Normalize attachment media URLs in a description JSON string to canonical /api/v1/attachments/:id/file paths. */
export function normalizeCardDescriptionAttachmentUrls(rawJson: string): string {
  const trimmed = rawJson.trim();
  if (trimmed === '') {
    return rawJson;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return rawJson;
  }

  const normalizeNode = (node: unknown): unknown => {
    if (!isRecord(node) || typeof node.type !== 'string') {
      return node;
    }
    const type = node.type;
    if ((type === 'image' || type === 'imageResize' || type === 'video') && isRecord(node.attrs)) {
      const attrs = { ...node.attrs } as Record<string, unknown>;
      if (typeof attrs.src === 'string' && attrs.src.trim() !== '') {
        attrs.src = normalizeAttachmentMediaSrcToProxyPath(attrs.src);
      }
      if (type === 'video' && typeof attrs.poster === 'string' && attrs.poster.trim() !== '') {
        attrs.poster = normalizeAttachmentMediaSrcToProxyPath(attrs.poster);
      }
      return { ...node, attrs };
    }
    if (Array.isArray(node.content)) {
      return { ...node, content: node.content.map((child) => normalizeNode(child)) };
    }
    return node;
  };

  const normalized = normalizeNode(parsed);
  const str = JSON.stringify(normalized);
  return isValidCardDescriptionJsonString(str) ? str : rawJson;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectPathTail2(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed === '') {
    return '';
  }
  const parsePath = (pathLike: string): string => {
    const noQuery = (pathLike.split('?')[0] ?? pathLike).split('#')[0] ?? pathLike;
    const normalized = decodeURIComponent(noQuery).replace(/^\/+/, '');
    const parts = normalized.split('/').filter((p) => p.length > 0);
    if (parts.length < 2) {
      return normalized;
    }
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  };
  try {
    const parsed = new URL(trimmed);
    return parsePath(parsed.pathname);
  } catch {
    return parsePath(trimmed);
  }
}

export function cardCoverReferencesAttachment(
  cover: string | undefined | null,
  attachmentId: string,
  attachmentUrl: string,
): boolean {
  if (cover == null || typeof cover !== 'string' || cover.trim() === '') {
    return false;
  }
  return mediaRefMatchesAttachment(cover, attachmentId, attachmentUrl);
}

export function mediaRefMatchesAttachment(
  src: string,
  attachmentId: string,
  attachmentUrl?: string,
): boolean {
  const idFromSrc = extractAttachmentIdFromMediaSrc(src);
  if (idFromSrc != null && idFromSrc === attachmentId) {
    return true;
  }
  if (typeof attachmentUrl !== 'string' || attachmentUrl.trim() === '') {
    return false;
  }
  const srcTail = objectPathTail2(src);
  const attachmentTail = objectPathTail2(attachmentUrl);
  return srcTail !== '' && attachmentTail !== '' && srcTail === attachmentTail;
}

function addAttachmentIdFromMediaSrc(ids: Set<string>, src: string): void {
  const id = extractAttachmentIdFromMediaSrc(src);
  if (id !== null && id.trim() !== '') {
    ids.add(id);
  }
}

function collectMediaAttachmentRefsFromAttrs(
  attrs: Record<string, unknown>,
  attachments: ReadonlyArray<AttachmentLike>,
  referenced: Set<string>,
): void {
  const src = typeof attrs.src === 'string' ? attrs.src : '';
  if (src !== '') {
    for (const attachment of attachments) {
      if (mediaRefMatchesAttachment(src, attachment.id, attachment.url)) {
        referenced.add(attachment.id);
        break;
      }
    }
  }
  const poster = typeof attrs.poster === 'string' ? attrs.poster : '';
  if (poster !== '') {
    for (const attachment of attachments) {
      if (mediaRefMatchesAttachment(poster, attachment.id, attachment.url)) {
        referenced.add(attachment.id);
        break;
      }
    }
  }
}

function walkCollectAttachmentIds(node: unknown, ids: Set<string>): void {
  if (!isRecord(node) || typeof node.type !== 'string') {
    return;
  }
  const type = node.type;
  if (type === 'image' || type === 'imageResize' || type === 'video') {
    const attrs = node.attrs;
    if (isRecord(attrs)) {
      if (typeof attrs.src === 'string') {
        addAttachmentIdFromMediaSrc(ids, attrs.src);
      }
      if (type === 'video' && typeof attrs.poster === 'string') {
        addAttachmentIdFromMediaSrc(ids, attrs.poster);
      }
    }
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      walkCollectAttachmentIds(child, ids);
    }
  }
}

/** Collects attachment ids referenced by inline image / imageResize / video nodes in a Tiptap JSON string. */
export function collectAttachmentIdsFromDescriptionJson(
  rawJson: string | undefined | null,
): Set<string> {
  const ids = new Set<string>();
  if (rawJson == null || rawJson.trim() === '') {
    return ids;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch {
    return ids;
  }
  walkCollectAttachmentIds(parsed, ids);
  return ids;
}

interface AttachmentLike {
  id: string;
  url: string;
}

/**
 * Collect attachment ids referenced by media nodes by matching either
 * attachment-file API URLs (/attachments/:id/file) or direct object URLs.
 */
export function collectReferencedAttachmentIdsFromDescriptionJson(
  rawJson: string | undefined | null,
  attachments: ReadonlyArray<AttachmentLike>,
): Set<string> {
  const referenced = new Set<string>();
  if (rawJson == null || rawJson.trim() === '' || attachments.length === 0) {
    return referenced;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch {
    return referenced;
  }

  const walk = (node: unknown): void => {
    if (!isRecord(node) || typeof node.type !== 'string') {
      return;
    }
    const type = node.type;
    if (type === 'image' || type === 'imageResize' || type === 'video') {
      const attrs = node.attrs;
      if (isRecord(attrs)) {
        collectMediaAttachmentRefsFromAttrs(attrs, attachments, referenced);
      }
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child);
      }
    }
  };

  walk(parsed);
  return referenced;
}

function emptyDoc(): unknown {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/**
 * Removes inline image / imageResize / video nodes that reference the given attachment id.
 * Returns a valid description JSON string (falls back to empty doc if validation fails).
 */
export function stripAttachmentFromDescriptionJsonString(
  rawJson: string,
  attachmentId: string,
  attachmentUrl?: string,
): string {
  const trimmed = rawJson.trim();
  if (trimmed === '') {
    return rawJson;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return rawJson;
  }
  const stripNodeWithUrl = (node: unknown): unknown | null => {
    if (!isRecord(node) || typeof node.type !== 'string') {
      return node;
    }
    const type = node.type;
    if (type === 'image' || type === 'imageResize' || type === 'video') {
      const attrs = node.attrs;
      if (!isRecord(attrs)) {
        return node;
      }
      const src = typeof attrs.src === 'string' ? attrs.src : '';
      if (mediaRefMatchesAttachment(src, attachmentId, attachmentUrl)) {
        return null;
      }
      if (type === 'video') {
        const poster = typeof attrs.poster === 'string' ? attrs.poster : '';
        if (poster !== '' && mediaRefMatchesAttachment(poster, attachmentId, attachmentUrl)) {
          const { poster: _removed, ...restAttrs } = attrs;
          return { ...node, attrs: restAttrs };
        }
      }
      return node;
    }
    if (!Array.isArray(node.content)) {
      return node;
    }
    const nextContent = node.content
      .map((child) => stripNodeWithUrl(child))
      .filter((child): child is unknown => child !== null);
    if (type === 'listItem' && nextContent.length === 0) {
      return null;
    }
    if ((type === 'bulletList' || type === 'orderedList') && nextContent.length === 0) {
      return null;
    }
    return { ...node, content: nextContent };
  };

  const stripped = (() => {
    if (!isRecord(parsed) || parsed.type !== 'doc') {
      return parsed;
    }
    const content = Array.isArray(parsed.content) ? parsed.content : [];
    const nextContent = content
      .map((child) => stripNodeWithUrl(child))
      .filter((child): child is unknown => child !== null);
    const finalContent = nextContent.length > 0 ? nextContent : [{ type: 'paragraph' }];
    return { ...parsed, content: finalContent };
  })();
  const str = JSON.stringify(stripped);
  if (!isValidCardDescriptionJsonString(str)) {
    // Keep the prior saved description when stripping would leave server-invalid JSON
    // (for example live editor state with blob: preview URLs).
    if (isValidCardDescriptionJsonString(trimmed)) {
      return trimmed;
    }
    return JSON.stringify(emptyDoc());
  }
  return str;
}

function remapMediaSrcForDuplicate(
  src: string,
  sourceAttachments: ReadonlyArray<AttachmentLike>,
  newAttachments: ReadonlyArray<AttachmentLike>,
): string {
  for (let i = 0; i < sourceAttachments.length; i += 1) {
    const oldA = sourceAttachments[i];
    const newA = newAttachments[i];
    if (oldA == null || newA == null) {
      continue;
    }
    if (!mediaRefMatchesAttachment(src, oldA.id, oldA.url)) {
      continue;
    }
    const idFrom = extractAttachmentIdFromMediaSrc(src);
    if (idFrom != null && idFrom === oldA.id) {
      let next = src.split(encodeURIComponent(oldA.id)).join(encodeURIComponent(newA.id));
      if (next === src) {
        next = src.split(oldA.id).join(newA.id);
      }
      return next;
    }
    return newA.url;
  }
  return src;
}

/**
 * Rewrites `image` / `imageResize` / `video` node `attrs.src` values after card attachments were
 * duplicated (parallel `sourceAttachments` / `newAttachments` rows, same order as `duplicateCardAttachmentsForNewCard`).
 */
export function remapAttachmentRefsInDescriptionJsonString(
  rawJson: string | undefined | null,
  sourceAttachments: ReadonlyArray<AttachmentLike>,
  newAttachments: ReadonlyArray<AttachmentLike>,
): string | undefined {
  if (rawJson == null) {
    return undefined;
  }
  if (rawJson.trim() === '' || sourceAttachments.length === 0 || newAttachments.length === 0) {
    return rawJson;
  }
  if (sourceAttachments.length !== newAttachments.length) {
    return rawJson;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch {
    return rawJson;
  }
  const remapNode = (node: unknown): unknown => {
    if (!isRecord(node) || typeof node.type !== 'string') {
      return node;
    }
    const type = node.type;
    if ((type === 'image' || type === 'imageResize' || type === 'video') && isRecord(node.attrs)) {
      const attrs = { ...node.attrs } as Record<string, unknown>;
      if (typeof attrs.src === 'string' && attrs.src.trim() !== '') {
        attrs.src = remapMediaSrcForDuplicate(attrs.src, sourceAttachments, newAttachments);
      }
      if (type === 'video' && typeof attrs.poster === 'string' && attrs.poster.trim() !== '') {
        attrs.poster = remapMediaSrcForDuplicate(attrs.poster, sourceAttachments, newAttachments);
      }
      return { ...node, attrs };
    }
    if (Array.isArray(node.content)) {
      return { ...node, content: node.content.map((child) => remapNode(child)) };
    }
    return node;
  };
  const remapped = remapNode(parsed);
  const str = JSON.stringify(remapped);
  if (!isValidCardDescriptionJsonString(str)) {
    return rawJson;
  }
  return str;
}

/** Best-effort URL/id substitution in rendered HTML (e.g. imports) after attachment duplication. */
export function remapAttachmentRefsInDescriptionHtmlString(
  html: string | undefined | null,
  sourceAttachments: ReadonlyArray<AttachmentLike>,
  newAttachments: ReadonlyArray<AttachmentLike>,
): string | undefined {
  if (html == null) {
    return undefined;
  }
  if (html.trim() === '' || sourceAttachments.length === 0 || newAttachments.length === 0) {
    return html;
  }
  if (sourceAttachments.length !== newAttachments.length) {
    return html;
  }
  let out = html;
  for (let i = 0; i < sourceAttachments.length; i += 1) {
    const oldA = sourceAttachments[i];
    const newA = newAttachments[i];
    if (oldA == null || newA == null) {
      continue;
    }
    if (typeof oldA.url === 'string' && oldA.url.trim() !== '') {
      out = out.split(oldA.url).join(newA.url);
    }
    let next = out.split(encodeURIComponent(oldA.id)).join(encodeURIComponent(newA.id));
    if (next === out) {
      next = out.split(oldA.id).join(newA.id);
    }
    out = next;
  }
  return out;
}
